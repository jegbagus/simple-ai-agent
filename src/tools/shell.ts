import { execSync } from 'child_process';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const DESTRUCTIVE_KEYWORDS = [
  'rm ', 'rmdir', 'del ', 'format', 'mkfs', 'dd ',
  'shred', '> ', 'truncate', 'shutdown', 'reboot',
  'halt', 'poweroff', 'chmod 777', 'git push',
  'git reset --hard', 'git clean', 'DROP TABLE',
  'DROP DATABASE', 'DELETE FROM',
];

function looksDestructive(command: string): boolean {
  const lower = command.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function executeCommand(
  command: string,
  requiresConfirmation = false,
): Promise<string> {
  const needsConfirm = requiresConfirmation || looksDestructive(command);

  if (needsConfirm) {
    const rl = readline.createInterface({ input, output });
    console.log(`\n  ⚠ About to run: ${command}`);
    const answer = await rl.question('  Proceed? [y/N] ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') return 'Command cancelled by user.';
  }

  try {
    const stdout = execSync(command, { encoding: 'utf-8', timeout: 60_000 });
    return stdout.trim() || '(no output)';
  } catch (err: any) {
    const parts: string[] = [];
    if (err.stdout?.trim()) parts.push(err.stdout.trim());
    if (err.stderr?.trim()) parts.push(`[stderr]\n${err.stderr.trim()}`);
    parts.push(`[exit code: ${err.status ?? 'unknown'}]`);
    return parts.join('\n');
  }
}
