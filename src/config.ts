import 'dotenv/config';

export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? '';
export const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? '';
export const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
export const MODEL = process.env.GOOGLE_VERTEX_MODEL ?? 'gemini-2.5-flash';
export const MAX_TOKENS = 4096;

// Max chars a single tool result can occupy in the conversation history.
export const MAX_TOOL_RESULT_CHARS = 2000;

// Max chars a single model text block is allowed to occupy when the
// history is sent to the API. Older long responses are trimmed in the
// outgoing payload only — the full text is never mutated in memory.
export const MAX_HISTORY_TEXT_CHARS = 3000;

// Max number of user+model turn pairs kept in the conversation history.
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
