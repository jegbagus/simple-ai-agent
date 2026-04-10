/**
 * Shared confirmation helper.
 * main.ts registers its readline interface via setConfirmFn so all tools
 * share the same stdin/stdout stream and avoid readline conflicts.
 */

import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';

type ConfirmFn = (message: string) => Promise<boolean>;

let _confirmFn: ConfirmFn | null = null;

/** Register a confirm function backed by the REPL's readline interface. */
export function setConfirmFn(fn: ConfirmFn): void {
  _confirmFn = fn;
}

/**
 * Prompt the user with a yes/no question.
 * Falls back to creating a temporary readline interface if none is registered.
 */
export async function confirm(message: string): Promise<boolean> {
  if (_confirmFn) return _confirmFn(message);

  // Fallback (should not normally be reached in the REPL)
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${message} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

/** Standard warning prefix for dangerous operations. */
export function warnLine(message: string): void {
  console.log(chalk.yellow(`\n  ⚠ ${message}`));
}
