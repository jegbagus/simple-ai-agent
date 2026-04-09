import 'dotenv/config';

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? '';
export const MODEL = 'claude-haiku-4-5';
export const MAX_TOKENS = 4096;

// Max chars a single tool result can occupy in the conversation history.
// Results longer than this are truncated before being appended.
export const MAX_TOOL_RESULT_CHARS = 2000;

// Max number of user+assistant turn pairs kept in the conversation history.
// Older turns are dropped (the very first user message is always kept).
export const MAX_HISTORY_TURNS = 10;

export const SYSTEM_PROMPT = `You are a capable AI agent running in the terminal. You can:
- Read, write, edit, and delete files
- Execute shell/terminal commands
- Search the web and fetch web pages
- Remember information across the conversation

Guidelines:
- Always confirm before deleting files or running destructive shell commands
- Be concise in your responses; prefer action over explanation
- When running shell commands, show the command before executing
- If unsure about an action, ask for clarification
`;
