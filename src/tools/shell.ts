import { execSync } from 'child_process';
import { confirm, warnLine } from '../confirm.js';

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
    warnLine(`About to run: ${command}`);
    const ok = await confirm('  Proceed?');
    if (!ok) return 'Command cancelled by user.';
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
