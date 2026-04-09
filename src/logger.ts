/**
 * Agent logger — prints inline in the chat (stdout) so you can see
 * exactly what is happening at each step of the agentic loop.
 *
 * Every API call, every message in the conversation history, every tool
 * call and its result are shown verbatim.
 *
 * Set LOG_LEVEL=off to silence all logs.
 */

import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';

export type LogLevel = 'on' | 'off';

const LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL ?? '').toLowerCase() === 'off' ? 'off' : 'on';

const enabled = LOG_LEVEL === 'on';

function print(text: string) {
  process.stdout.write(text + '\n');
}

function divider(char = '─', width = 72) {
  return chalk.dim(char.repeat(width));
}

function ts() {
  return chalk.dim(new Date().toLocaleTimeString());
}

// ---------------------------------------------------------------------------
// Public log functions (called from loop.ts)
// ---------------------------------------------------------------------------

/**
 * Printed before every API call.
 * Shows: model, iteration number, the full system prompt,
 * and every message in the conversation history with its content.
 */
export function logRequest(
  iteration: number,
  model: string,
  messages: Anthropic.MessageParam[],
  system: string,
): void {
  if (!enabled) return;

  print('');
  print(chalk.bold.bgYellow.black(` ▶ API REQUEST #${iteration} `) + '  ' + ts());
  print(divider('─'));

  print(chalk.bold('  Model   : ') + chalk.cyan(model));
  print(chalk.bold('  History : ') + `${messages.length} message(s) queued`);

  print('');
  print(chalk.bold.magenta('  ┌─ System Prompt ────────────────────────────────────'));
  system.trim().split('\n').forEach((line) =>
    print(chalk.dim('  │ ') + chalk.white(line)),
  );
  print(chalk.bold.magenta('  └────────────────────────────────────────────────────'));

  print('');
  print(chalk.bold.magenta('  ┌─ Messages sent to Claude ──────────────────────────'));

  if (messages.length === 0) {
    print(chalk.dim('  │  (no messages yet)'));
  }

  messages.forEach((msg, i) => {
    const roleTag =
      msg.role === 'user'
        ? chalk.bgGreen.black(` user `)
        : chalk.bgBlue.white(` assistant `);

    print(chalk.dim(`  │`) + ` [${i}] ${roleTag}`);

    const blocks = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : (msg.content as any[]);

    blocks.forEach((block: any) => {
      if (block.type === 'text') {
        block.text.split('\n').forEach((line: string) =>
          print(chalk.dim('  │    ') + chalk.white(truncate(line, 200))),
        );

      } else if (block.type === 'tool_use') {
        print(
          chalk.dim('  │    ') +
          chalk.cyan('tool_use') +
          chalk.dim(` › name=`) + chalk.bold.cyan(block.name) +
          chalk.dim(`  id=${block.id}`),
        );
        JSON.stringify(block.input, null, 2).split('\n').forEach((line) =>
          print(chalk.dim('  │      ') + chalk.yellow(line)),
        );

      } else if (block.type === 'tool_result') {
        const body = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content);
        print(
          chalk.dim('  │    ') +
          chalk.green('tool_result') +
          chalk.dim(` › for=${block.tool_use_id}`),
        );
        truncate(body, 800).split('\n').forEach((line) =>
          print(chalk.dim('  │      ') + chalk.white(line)),
        );
      }
    });

    print(chalk.dim('  │'));
  });

  print(chalk.bold.magenta('  └────────────────────────────────────────────────────'));
  print(divider('─'));
}

/** Printed when Claude starts streaming back a text response */
export function logStreamStart(): void {
  if (!enabled) return;
  print('');
  print(chalk.bold.bgBlue.white(' ◀ CLAUDE RESPONSE ') + '  ' + ts());
  print(divider('·'));
}

/** Printed after streaming ends — shows stop reason and token usage */
export function logStreamEnd(
  stopReason: string | null,
  usage: { input_tokens: number; output_tokens: number },
): void {
  if (!enabled) return;
  print('');
  print(divider('·'));
  const stop = stopReason === 'tool_use'
    ? chalk.yellow(stopReason)
    : chalk.green(stopReason ?? 'unknown');
  print(
    chalk.bold('  Stop reason : ') + stop + '  ' +
    chalk.bold('Tokens in : ') + chalk.cyan(String(usage.input_tokens)) + '  ' +
    chalk.bold('out : ') + chalk.cyan(String(usage.output_tokens)),
  );
  print(divider('─'));
}

/** Printed when Claude decides to call a tool — shows full input */
export function logToolCall(
  name: string,
  input: Record<string, unknown>,
  toolId: string,
): void {
  if (!enabled) return;
  print('');
  print(
    chalk.bold.bgCyan.black(` 🔧 TOOL CALL `) +
    '  ' + chalk.bold.cyan(name) +
    chalk.dim(`  id=${toolId}`) +
    '  ' + ts(),
  );
  print(chalk.bold('  Input:'));
  JSON.stringify(input, null, 2).split('\n').forEach((line) =>
    print('  ' + chalk.yellow(line)),
  );
}

/** Printed after a tool finishes — shows the full result and duration */
export function logToolResult(
  name: string,
  result: string,
  durationMs: number,
): void {
  if (!enabled) return;
  print('');
  print(
    chalk.bold.bgGreen.black(` ✓ TOOL RESULT `) +
    '  ' + chalk.bold.green(name) +
    chalk.dim(`  (${durationMs}ms)`),
  );
  print(chalk.bold('  Result:'));
  result.split('\n').forEach((line) =>
    print('  ' + chalk.white(line)),
  );
  print(divider('─'));
}

/** Printed when the loop exits cleanly */
export function logAgentDone(totalIterations: number): void {
  if (!enabled) return;
  print('');
  print(
    chalk.bold.bgGreen.black(' ✅ AGENT DONE ') +
    chalk.dim(`  iterations=${totalIterations}`) +
    '  ' + ts(),
  );
  print(divider('═'));
}

/**
 * Printed with the raw HTTP request body sent to the Anthropic API.
 * Called from the custom fetch wrapper in loop.ts.
 */
export function logHttpRequest(url: string, body: unknown): void {
  if (!enabled) return;
  print('');
  print(chalk.bold.bgMagenta.white(' 📤 HTTP REQUEST ') + '  ' + chalk.dim(url) + '  ' + ts());
  print(divider('·'));
  JSON.stringify(body, null, 2).split('\n').forEach((line) =>
    print(chalk.dim('  ') + chalk.magenta(line)),
  );
  print(divider('·'));
}

/**
 * Printed with the raw HTTP response body from the Anthropic API.
 * For streaming responses, shows the raw SSE lines as they arrive.
 */
export function logHttpResponse(status: number, body: string): void {
  if (!enabled) return;
  print('');
  const statusColor = status >= 200 && status < 300 ? chalk.bgGreen.black : chalk.bgRed.white;
  print(statusColor(` 📥 HTTP RESPONSE ${status} `) + '  ' + ts());
  print(divider('·'));
  // Pretty-print if JSON, otherwise show raw (SSE lines)
  try {
    const parsed = JSON.parse(body);
    JSON.stringify(parsed, null, 2).split('\n').forEach((line) =>
      print(chalk.dim('  ') + chalk.green(line)),
    );
  } catch {
    // SSE event types to skip entirely — these are high-frequency delta chunks
    // that produce no useful information for understanding agent behaviour.
    const SKIP_EVENTS = new Set([
      'content_block_delta',
      'text_delta',
      'input_json_delta',
    ]);

    let skipNextData = false;

    body.split('\n').forEach((line) => {
      if (!line.trim()) return;

      if (line.startsWith('event:')) {
        const eventType = line.replace('event:', '').trim();
        skipNextData = SKIP_EVENTS.has(eventType);
        if (!skipNextData) print(chalk.dim('  ') + chalk.bold.green(line));
      } else if (line.startsWith('data:')) {
        if (!skipNextData) print(chalk.dim('  ') + chalk.green(line));
      } else {
        print(chalk.dim('  ') + chalk.dim(line));
      }
    });
  }
  print(divider('·'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + chalk.dim(` … [+${str.length - max} chars]`);
}
