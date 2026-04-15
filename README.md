# AI Agent

A terminal-based AI agent powered by [Claude](https://www.anthropic.com/claude) (`claude-sonnet-4-6`). Chat naturally in your terminal, and the agent autonomously reasons and acts using built-in tools — reading files, running commands, searching the web, and more.

---

## Features

- **File operations** — read, write, edit, delete files and list directories
- **Shell execution** — run arbitrary terminal commands (with confirmation for destructive ones)
- **Web search** — search the web via [Tavily](https://tavily.com)
- **Web fetch** — fetch and scrape any web page
- **Long-term memory** — persist notes and facts across sessions (flat JSON, upgradeable to vector DB)
- **Streaming output** — word-by-word responses for a natural feel
- **Session logging** — every session is automatically saved to a log file

---

## Requirements

- **Node.js** v18+
- **npm**
- An [Anthropic API key](https://console.anthropic.com/)
- A [Tavily API key](https://tavily.com/) _(optional — required for web search)_

---

## Setup

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd ai-agent
npm install
```

**2. Configure environment variables**

Copy the example file and fill in your API keys:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=your_anthropic_key_here
TAVILY_API_KEY=your_tavily_key_here
```

**3. Start the agent**

```bash
npm start
```

---

## Usage

Once started, you'll see a prompt in your terminal:

```
AI Agent — powered by Claude
Commands: /exit quit · /clear clear history · /help show tools

Model: claude-sonnet-4-6
Session log: logs/session-2024-01-01.log

you ›
```

Type any natural language request and press Enter. The agent will reason through it and use tools as needed.

### Example prompts

```
you › What files are in the current directory?
you › Read the contents of package.json
you › Search the web for the latest Node.js release
you › Create a file called notes.txt with a summary of our conversation
you › Run the tests and show me the output
you › Remember that the production database host is db.example.com
```

### Built-in commands

| Command  | Description                     |
|----------|---------------------------------|
| `/help`  | Show all available tools        |
| `/clear` | Clear the conversation history  |
| `/exit`  | Quit the agent                  |

Press **Ctrl+C** at any time to exit.

---

## Available Tools

| Tool               | Description                                      |
|--------------------|--------------------------------------------------|
| `read_file`        | Read the contents of a file                      |
| `write_file`       | Write or create a file                           |
| `edit_file`        | Edit part of a file                              |
| `delete_file`      | Delete a file _(requires confirmation)_          |
| `list_directory`   | List the contents of a directory                 |
| `execute_command`  | Run a shell command _(destructive ops confirmed)_|
| `web_search`       | Search the web via Tavily                        |
| `web_fetch`        | Fetch and scrape a web page                      |
| `memory_read`      | Read from long-term memory                       |
| `memory_write`     | Write to long-term memory                        |

---

## Project Structure

```
ai-agent/
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript config
├── .env.example               # Environment variable template
├── memory/
│   └── sessions.json          # Persisted long-term memory
└── src/
    ├── main.ts                # REPL entry point
    ├── loop.ts                # Agentic loop (streaming + tool handling)
    ├── config.ts              # API keys, model, system prompt
    ├── logger.ts              # Session file logging
    ├── confirm.ts             # Safety confirmation helper
    └── tools/
        ├── fileOps.ts         # File read/write/edit/delete
        ├── shell.ts           # Shell command execution
        ├── webSearch.ts       # Web search via Tavily
        ├── webFetch.ts        # HTTP fetch + HTML parsing
        └── memory.ts          # Long-term memory read/write
```

---

## How It Works

The agent follows the standard **agentic loop** pattern:

```
User input
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
Stream output to terminal → wait for next input
```

---

## Tech Stack

| Layer            | Choice                          |
|------------------|---------------------------------|
| Language         | TypeScript                      |
| LLM              | `@anthropic-ai/sdk` (Claude)    |
| CLI / REPL       | Node.js `readline/promises`     |
| Styling          | `chalk`                         |
| Web search       | `@tavily/core`                  |
| Web fetch        | `axios` + `cheerio`             |
| TypeScript runner| `tsx`                           |

---

## License

MIT
