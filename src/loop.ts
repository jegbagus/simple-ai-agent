/**
 * Agentic loop: sends messages to Claude, handles tool calls, streams output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, MODEL, MAX_TOKENS, SYSTEM_PROMPT, MAX_TOOL_RESULT_CHARS, MAX_HISTORY_TURNS, MAX_HISTORY_TEXT_CHARS } from './config.js';
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
  logHttpRequest,
  logHttpResponse,
} from './logger.js';

// ---------------------------------------------------------------------------
// Custom fetch wrapper — intercepts raw HTTP request and response bodies
// ---------------------------------------------------------------------------

async function loggingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();

  // Log request body
  if (init?.body) {
    try {
      logHttpRequest(url, JSON.parse(init.body as string));
    } catch {
      logHttpRequest(url, init.body);
    }
  }

  const response = await fetch(input, init);

  // Clone so we can read the body without consuming the original stream
  const clone = response.clone();

  // Collect full body text then log it
  clone.text().then((body) => {
    logHttpResponse(response.status, body);
  }).catch(() => {});

  return response;
}

// The Anthropic SDK retries 429 and 5xx by default (max_retries=2).
// We raise it to 6 and also handle 529 overloaded_error explicitly.
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, fetch: loggingFetch, maxRetries: 6 });

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace a specific string in a file with new content.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file. Asks for user confirmation before proceeding.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at the given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (default: current directory)' },
      },
      required: [],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command. Destructive commands require user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        requires_confirmation: {
          type: 'boolean',
          description: 'Set true for commands that modify/delete data or have side effects',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information using Tavily.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and extract text content from a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'memory_read',
    description: 'Read all stored long-term memories.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'memory_write',
    description: 'Save a piece of information to long-term memory.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short identifier for the memory' },
        value: { type: 'string', description: 'Information to remember' },
      },
      required: ['key', 'value'],
    },
  },
];

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
// Content block accumulation helpers
// ---------------------------------------------------------------------------

interface TextBlock { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: ToolInput }
type ContentBlock = TextBlock | ToolUseBlock;

// ---------------------------------------------------------------------------
// History trimming — applied to the outgoing payload only, never in-place
// ---------------------------------------------------------------------------

/**
 * Returns a copy of the messages array where long assistant text blocks are
 * trimmed to MAX_HISTORY_TEXT_CHARS. The originals in memory are untouched.
 */
function trimHistoryForApi(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant') return msg;

    const blocks = typeof msg.content === 'string'
      ? [{ type: 'text' as const, text: msg.content }]
      : (msg.content as Anthropic.ContentBlock[]);

    const trimmed = blocks.map((block) => {
      if (block.type === 'text' && block.text.length > MAX_HISTORY_TEXT_CHARS) {
        return {
          ...block,
          text:
            block.text.slice(0, MAX_HISTORY_TEXT_CHARS) +
            `\n… [${block.text.length - MAX_HISTORY_TEXT_CHARS} chars omitted from history]`,
        };
      }
      return block;
    });

    return { ...msg, content: trimmed };
  });
}

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isOverloaded = err?.status === 529 || err?.error?.type === 'overloaded_error';
      const isRateLimit  = err?.status === 429;

      if ((isOverloaded || isRateLimit) && attempt < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s, 16s …
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const reason = isOverloaded ? 'overloaded_error (529)' : 'rate_limit (429)';
        onChunk(`\n[retrying after ${reason} — waiting ${delay / 1000}s, attempt ${attempt}/${MAX_RETRIES}]\n`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function runAgent(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
): Promise<void> {
  let iteration = 0;

  while (true) {
    iteration++;
    logRequest(iteration, MODEL, messages, SYSTEM_PROMPT);

    const content: ContentBlock[] = [];
    let currentText = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolJson = '';
    let inToolUse = false;
    let streamStarted = false;

    const finalMessage = await withRetry(async () => {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: trimHistoryForApi(messages),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            if (!streamStarted) { logStreamStart(); streamStarted = true; }
            inToolUse = false;
            currentText = '';
          } else if (event.content_block.type === 'tool_use') {
            if (currentText) {
              content.push({ type: 'text', text: currentText });
              currentText = '';
            }
            inToolUse = true;
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolJson = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentText += event.delta.text;
            onChunk(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            currentToolJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (inToolUse) {
            let parsedInput: ToolInput = {};
            try { parsedInput = currentToolJson ? JSON.parse(currentToolJson) : {}; } catch {}
            content.push({ type: 'tool_use', id: currentToolId, name: currentToolName, input: parsedInput });
            inToolUse = false;
          } else if (currentText) {
            content.push({ type: 'text', text: currentText });
            currentText = '';
          }
        }
      }

      return stream.finalMessage();
    });
    logStreamEnd(finalMessage.stop_reason, finalMessage.usage);

    // Append assistant response to history
    messages.push({ role: 'assistant', content: content as Anthropic.ContentBlock[] });

    if (finalMessage.stop_reason !== 'tool_use') {
      logAgentDone(iteration);
      break;
    }

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type !== 'tool_use') continue;

      logToolCall(block.name, block.input, block.id);

      const start = Date.now();
      const result = await dispatchTool(block.name, block.input);
      logToolResult(block.name, result, Date.now() - start);

      // Truncate large results before storing in history
      const stored =
        result.length > MAX_TOOL_RESULT_CHARS
          ? result.slice(0, MAX_TOOL_RESULT_CHARS) +
            `\n… [truncated: ${result.length - MAX_TOOL_RESULT_CHARS} more chars omitted from history]`
          : result;

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: stored });
    }

    messages.push({ role: 'user', content: toolResults });

    // Keep history bounded: always preserve the first message (the original
    // user request), then keep only the most recent MAX_HISTORY_TURNS pairs.
    // Each "turn pair" = 1 assistant message + 1 user message = 2 entries.
    const maxEntries = 1 + MAX_HISTORY_TURNS * 2;
    if (messages.length > maxEntries) {
      const firstMessage = messages[0];
      messages.splice(0, messages.length - maxEntries + 1);
      messages.unshift(firstMessage);
    }

    onChunk('\n');
  }
}
