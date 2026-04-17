/**
 * Agent logger — writes a plain-text copy to log/<timestamp>.log
 * so you have a permanent record of every session.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// File logger — one file per session, in log/ directory
// ---------------------------------------------------------------------------

let fileStream: fs.WriteStream | null = null;

/** Call once at session start (from main.ts). Creates log/<timestamp>.log */
export function initFileLog(): string {
  const dir = path.resolve('log');
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '');           // e.g. 2026-04-09T14-30-00
  const filePath = path.join(dir, `${stamp}.log`);

  fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  fileStream.write(`SESSION START  ${now.toISOString()}\n${'='.repeat(72)}\n\n`);

  return filePath;
}

function fwrite(text: string) {
  fileStream?.write(text + '\n');
}

function fdivider(char = '─', width = 72) {
  return char.repeat(width);
}

function fts() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public log functions (called from loop.ts)
// ---------------------------------------------------------------------------

/** Logged before every API call. */
export function logRequest(
  iteration: number,
  model: string,
  messages: any[],
  system: string,
): void {
  fwrite('');
  fwrite(`▶ API REQUEST #${iteration}  ${fts()}`);
  fwrite(fdivider());
  fwrite(`  Model   : ${model}`);
  fwrite(`  History : ${messages.length} message(s) queued`);
  fwrite('');
  fwrite('  ┌─ System Prompt ──────────────────────────────────────────────────');
  system.trim().split('\n').forEach((line) => fwrite(`  │ ${line}`));
  fwrite('  └──────────────────────────────────────────────────────────────────');
  fwrite('');
  fwrite('  ┌─ Messages sent to Gemini ─────────────────────────────────────────');

  if (messages.length === 0) fwrite('  │  (no messages yet)');

  messages.forEach((msg, i) => {
    fwrite(`  │ [${i}] [${msg.role}]`);
    const parts: any[] = msg.parts ?? [];

    parts.forEach((part: any) => {
      if (part.text) {
        part.text.split('\n').forEach((line: string) => fwrite(`  │    ${line}`));
      } else if (part.functionCall) {
        fwrite(`  │    functionCall › name=${part.functionCall.name}`);
        JSON.stringify(part.functionCall.args ?? {}, null, 2)
          .split('\n')
          .forEach((line) => fwrite(`  │      ${line}`));
      } else if (part.functionResponse) {
        fwrite(`  │    functionResponse › name=${part.functionResponse.name}`);
        JSON.stringify(part.functionResponse.response ?? {}, null, 2)
          .split('\n')
          .forEach((line: string) => fwrite(`  │      ${line}`));
      }
    });
    fwrite('  │');
  });

  fwrite('  └──────────────────────────────────────────────────────────────────');
  fwrite(fdivider());
}

/** Logged when Gemini starts streaming back a text response. */
export function logStreamStart(): void {
  fwrite('');
  fwrite(`◀ GEMINI RESPONSE  ${fts()}`);
  fwrite(fdivider('·'));
}

/** Logged after streaming ends — shows finish reason and token usage. */
export function logStreamEnd(
  finishReason: string | null,
  usage: { input_tokens: number; output_tokens: number },
): void {
  fwrite(fdivider('·'));
  fwrite(`  Finish reason : ${finishReason ?? 'unknown'}  Tokens in : ${usage.input_tokens}  out : ${usage.output_tokens}`);
  fwrite(fdivider());
}

/** Logged when Gemini decides to call a tool. */
export function logToolCall(
  name: string,
  input: Record<string, unknown>,
  toolId: string,
): void {
  fwrite('');
  fwrite(`TOOL CALL  ${name}${toolId ? `  id=${toolId}` : ''}  ${fts()}`);
  fwrite('  Input:');
  JSON.stringify(input, null, 2).split('\n').forEach((line) => fwrite(`  ${line}`));
}

/** Logged after a tool finishes. */
export function logToolResult(
  name: string,
  result: string,
  durationMs: number,
): void {
  fwrite('');
  fwrite(`TOOL RESULT  ${name}  (${durationMs}ms)`);
  fwrite('  Result:');
  result.split('\n').forEach((line) => fwrite(`  ${line}`));
  fwrite(fdivider());
}

/** Logged when the loop exits cleanly. */
export function logAgentDone(totalIterations: number): void {
  fwrite('');
  fwrite(`AGENT DONE  iterations=${totalIterations}  ${fts()}`);
  fwrite(fdivider('═'));
}

/** Logged with the raw HTTP request body. */
export function logHttpRequest(url: string, body: unknown): void {
  fwrite('');
  fwrite(`HTTP REQUEST  ${url}  ${fts()}`);
  fwrite(fdivider('·'));
  JSON.stringify(body, null, 2).split('\n').forEach((line) => fwrite(`  ${line}`));
  fwrite(fdivider('·'));
}

/** Logged with the raw HTTP response body. */
export function logHttpResponse(status: number, body: string): void {
  fwrite('');
  fwrite(`HTTP RESPONSE ${status}  ${fts()}`);
  fwrite(fdivider('·'));
  try {
    const parsed = JSON.parse(body);
    JSON.stringify(parsed, null, 2).split('\n').forEach((line) => fwrite(`  ${line}`));
  } catch {
    body.split('\n').forEach((line) => {
      if (line.trim()) fwrite(`  ${line}`);
    });
  }
  fwrite(fdivider('·'));
}

/** Called from main.ts when the user types a message. */
export function logUserInput(text: string): void {
  fwrite('');
  fwrite(`USER  ${fts()}`);
  fwrite(`  ${text}`);
  fwrite(fdivider());
}

/** Called from main.ts when the agent finishes responding. */
export function logAgentOutput(text: string): void {
  fwrite('');
  fwrite(`AGENT OUTPUT  ${fts()}`);
  text.split('\n').forEach((line) => fwrite(`  ${line}`));
  fwrite(fdivider());
}
