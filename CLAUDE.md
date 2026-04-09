# AI Agent — Project Reference

## Overview

A terminal-based AI agent chatbot powered by Claude (claude-sonnet-4-6). Works as a CLI REPL where the user types natural language, and the agent autonomously reasons and acts using tools.

---

## Agent Capabilities

### File & System
- Read files and directory listings
- Write, edit, create, delete files
- Execute shell/terminal commands
- Search file contents (grep-like)

### Web & Network
- Web search (via Tavily or Brave Search API)
- Fetch and scrape web pages
- Call external REST APIs

### Memory & Context
- Short-term: conversation history within a session
- Long-term: file-based or vector DB memory across sessions

### Code & Dev
- Run code snippets in a subprocess sandbox
- Lint, test, or analyze code

### Tools & Integrations
- Git operations
- Database queries (future)
- Clipboard read/write (future)
- Send notifications (future)

---

## Stack Decisions

| Layer | Choice | Reason |
|---|---|---|
| Language | **TypeScript** | Familiar to team, type-safe, great SDK support |
| LLM | `@anthropic-ai/sdk` — `claude-sonnet-4-6` | Native tool use, streaming support |
| CLI / REPL UI | Node.js `readline/promises` + `chalk` | Built-in, no extra deps for input |
| Tool execution | Custom TS functions registered as Claude tools | Simple, explicit, fully typed |
| Web search | `@tavily/core` | Clean, agent-friendly results |
| Web fetch | `axios` + `cheerio` | HTTP + HTML parsing |
| File ops | Node.js `fs` (stdlib) | Simple and reliable |
| Shell exec | Node.js `child_process` (stdlib) | Run arbitrary terminal commands |
| Memory (long-term) | Flat JSON file | Start simple, upgrade to vector DB later |
| Package management | `npm` with `package.json` | Standard JS tooling |
| TypeScript runner | `tsx` | Run `.ts` files directly, no compile step needed |

---

## Architecture: Agentic Loop

```
User types message
        ↓
Conversation loop (Python REPL)
        ↓
Send messages + tool definitions → Claude API
        ↓
Claude responds with text OR tool_use block(s)
        ↓
If tool_use → execute the tool locally
        ↓
Send tool result back to Claude
        ↓
Claude continues reasoning → final text response
        ↓
Print to terminal → wait for next user input
```

This follows the standard **tool use / agentic loop** pattern from the Anthropic API.

---

## Key Design Decisions (agreed)

1. **Language**: TypeScript (user is more familiar with JS/TS)
2. **LLM**: Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk`
3. **Long-term memory**: Start with flat JSON, upgrade to `chromadb` when needed
4. **Safety guardrails**: Prompt user before running destructive shell commands or deleting files
5. **Output**: Streaming (word-by-word) for a natural feel
6. **Packaging**: Installable as a global CLI command via `pyproject.toml` entry point

---

## Project Structure

```
ai-agent/
├── CLAUDE.md                  # This file — project reference
├── package.json               # Dependencies and npm scripts
├── tsconfig.json              # TypeScript config
├── .env.example               # Environment variable template
├── .gitignore
├── bin/
│   └── run.js                 # CLI entry point wrapper
├── memory/
│   └── sessions.json          # Persisted long-term memory
└── src/
    ├── main.ts                # REPL entry point
    ├── loop.ts                # Agentic loop (streaming + tool handling)
    ├── config.ts              # API keys, model, system prompt
    └── tools/
        ├── fileOps.ts         # Read, write, edit, delete files
        ├── shell.ts           # Execute terminal commands
        ├── webSearch.ts       # Web search via Tavily
        ├── webFetch.ts        # Fetch and scrape web pages
        └── memory.ts          # Long-term memory read/write
```

---

## Environment Variables Needed

```
ANTHROPIC_API_KEY=       # Required — Claude API
TAVILY_API_KEY=          # Required — web search
```

---

## Next Steps

- [x] Scaffold project structure
- [x] Implement agentic loop (`loop.ts`)
- [x] Implement tools (file, shell, web search, web fetch, memory)
- [x] Wire up streaming output
- [x] Add safety guardrails for destructive operations
- [x] Add long-term memory (flat JSON)
- [ ] Install dependencies and run: `npm install && npm start`
- [ ] Upgrade memory to vector DB (chromadb) when needed
