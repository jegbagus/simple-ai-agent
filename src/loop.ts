/**
 * Agentic loop: sends messages to Gemini, handles tool calls, streams output.
 */

import { GoogleGenAI, Content, Part, FunctionCall, Tool, Type } from '@google/genai';
import {
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
  MODEL,
  MAX_TOKENS,
  SYSTEM_PROMPT,
  MAX_TOOL_RESULT_CHARS,
  MAX_HISTORY_TURNS,
  MAX_HISTORY_TEXT_CHARS,
} from './config.js';
import { readFile, writeFile, editFile, deleteFile, listDirectory } from './tools/fileOps.js';
import { executeCommand } from './tools/shell.js';
import { webSearch } from './tools/webSearch.js';
import { webFetch } from './tools/webFetch.js';
import { memoryRead, memoryWrite } from './tools/memory.js';
import {
  logRequest,
  logStreamStart,
  logStreamEnd,
  logToolCall,
  logToolResult,
  logAgentDone,
} from './logger.js';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const ai = new GoogleGenAI({
  vertexai: true,
  project: GOOGLE_CLOUD_PROJECT,
  location: GOOGLE_CLOUD_LOCATION,
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [{
  functionDeclarations: [
    {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'Absolute or relative file path' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file, creating it if it does not exist.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'File path to write to' },
          content: { type: Type.STRING, description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit_file',
      description: 'Replace a specific string in a file with new content.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'File path' },
          old_string: { type: Type.STRING, description: 'Exact text to replace' },
          new_string: { type: Type.STRING, description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'delete_file',
      description: 'Delete a file. Asks for user confirmation before proceeding.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'File path to delete' },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_directory',
      description: 'List files and directories at the given path.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING, description: 'Directory path (default: current directory)' },
        },
        required: [],
      },
    },
    {
      name: 'execute_command',
      description: 'Execute a shell command. Destructive commands require user confirmation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          command: { type: Type.STRING, description: 'Shell command to execute' },
          requires_confirmation: {
            type: Type.BOOLEAN,
            description: 'Set true for commands that modify/delete data or have side effects',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'web_search',
      description: 'Search the web for information using Tavily.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch and extract text content from a URL.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
    {
      name: 'memory_read',
      description: 'Read all stored long-term memories.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: [],
      },
    },
    {
      name: 'memory_write',
      description: 'Save a piece of information to long-term memory.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, description: 'Short identifier for the memory' },
          value: { type: Type.STRING, description: 'Information to remember' },
        },
        required: ['key', 'value'],
      },
    },
  ],
}];

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

type ToolInput = Record<string, unknown>;

async function dispatchTool(name: string, input: ToolInput): Promise<string> {
  try {
    switch (name) {
      case 'read_file':        return readFile(input.path as string);
      case 'write_file':       return await writeFile(input.path as string, input.content as string);
      case 'edit_file':        return await editFile(input.path as string, input.old_string as string, input.new_string as string);
      case 'delete_file':      return await deleteFile(input.path as string);
      case 'list_directory':   return listDirectory((input.path as string | undefined) ?? '.');
      case 'execute_command':  return await executeCommand(input.command as string, (input.requires_confirmation as boolean | undefined) ?? false);
      case 'web_search':       return await webSearch(input.query as string);
      case 'web_fetch':        return await webFetch(input.url as string);
      case 'memory_read':      return memoryRead();
      case 'memory_write':     return memoryWrite(input.key as string, input.value as string);
      default:                 return `Error: unknown tool '${name}'`;
    }
  } catch (e) {
    return `Error running ${name}: ${e}`;
  }
}

// ---------------------------------------------------------------------------
// History trimming — applied to the outgoing payload only, never in-place
// ---------------------------------------------------------------------------

function trimHistoryForApi(messages: Content[]): Content[] {
  return messages.map((msg) => {
    if (msg.role !== 'model') return msg;
    const trimmed = (msg.parts ?? []).map((part) => {
      if (part.text && part.text.length > MAX_HISTORY_TEXT_CHARS) {
        return {
          ...part,
          text:
            part.text.slice(0, MAX_HISTORY_TEXT_CHARS) +
            `\n… [${part.text.length - MAX_HISTORY_TEXT_CHARS} chars omitted from history]`,
        };
      }
      return part;
    });
    return { ...msg, parts: trimmed };
  });
}

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

export async function runAgent(
  messages: Content[],
  onChunk: (text: string) => void,
): Promise<void> {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 2000;

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isRateLimit = err?.status === 429 || err?.message?.includes('quota');

        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          onChunk(`\n[retrying after rate_limit (429) — waiting ${delay / 1000}s, attempt ${attempt}/${MAX_RETRIES}]\n`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max retries exceeded');
  }

  let iteration = 0;

  while (true) {
    iteration++;
    logRequest(iteration, MODEL, messages, SYSTEM_PROMPT);

    let fullText = '';
    const functionCalls: FunctionCall[] = [];
    let finishReason = 'STOP';
    let usageMetadata: any = null;
    let streamStarted = false;

    await withRetry(async () => {
      for await (const chunk of await ai.models.generateContentStream({
        model: MODEL,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: TOOLS,
          maxOutputTokens: MAX_TOKENS,
        },
        contents: trimHistoryForApi(messages),
      })) {
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) finishReason = candidate.finishReason as string;

        for (const part of (candidate?.content?.parts ?? []) as Part[]) {
          if (part.text) {
            if (!streamStarted) { logStreamStart(); streamStarted = true; }
            onChunk(part.text);
            fullText += part.text;
          }
          if (part.functionCall) {
            functionCalls.push(part.functionCall as FunctionCall);
          }
        }
      }
    });

    logStreamEnd(finishReason, {
      input_tokens: usageMetadata?.promptTokenCount ?? 0,
      output_tokens: usageMetadata?.candidatesTokenCount ?? 0,
    });

    // Append model response to history
    const modelParts: Part[] = [];
    if (fullText) modelParts.push({ text: fullText });
    for (const fc of functionCalls) modelParts.push({ functionCall: fc });
    messages.push({ role: 'model', parts: modelParts });

    if (functionCalls.length === 0) {
      logAgentDone(iteration);
      break;
    }

    // Execute tool calls and collect responses
    const responseParts: Part[] = [];

    for (const fc of functionCalls) {
      const input = (fc.args ?? {}) as ToolInput;
      logToolCall(fc.name ?? '', input, '');

      const start = Date.now();
      const result = await dispatchTool(fc.name ?? '', input);
      logToolResult(fc.name ?? '', result, Date.now() - start);

      const stored =
        result.length > MAX_TOOL_RESULT_CHARS
          ? result.slice(0, MAX_TOOL_RESULT_CHARS) +
            `\n… [truncated: ${result.length - MAX_TOOL_RESULT_CHARS} more chars omitted from history]`
          : result;

      responseParts.push({
        functionResponse: {
          name: fc.name ?? '',
          response: { output: stored },
        },
      });
    }

    messages.push({ role: 'user', parts: responseParts });

    // Keep history bounded: always preserve the first message (the original
    // user request), then keep only the most recent MAX_HISTORY_TURNS pairs.
    const maxEntries = 1 + MAX_HISTORY_TURNS * 2;
    if (messages.length > maxEntries) {
      const firstMessage = messages[0];
      messages.splice(0, messages.length - maxEntries + 1);
      messages.unshift(firstMessage);
    }

    onChunk('\n');
  }
}
