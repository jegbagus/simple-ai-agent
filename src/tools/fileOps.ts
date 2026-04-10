import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { confirm, warnLine } from '../confirm.js';

export function readFile(path: string): string {
  const p = resolve(path);
  if (!existsSync(p)) return `Error: file not found: ${path}`;
  try {
    return readFileSync(p, 'utf-8');
  } catch (e) {
    return `Error reading file: ${e}`;
  }
}

export async function writeFile(path: string, content: string): Promise<string> {
  const p = resolve(path);
  const exists = existsSync(p);
  const action = exists ? `Overwrite '${path}'` : `Create new file '${path}'`;

  warnLine(action);
  const ok = await confirm(`  Proceed?`);
  if (!ok) return `${exists ? 'Overwrite' : 'Create'} cancelled by user.`;

  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf-8');
    return `Written ${content.length} chars to ${path}`;
  } catch (e) {
    return `Error writing file: ${e}`;
  }
}

export async function editFile(path: string, oldString: string, newString: string): Promise<string> {
  const p = resolve(path);
  if (!existsSync(p)) return `Error: file not found: ${path}`;

  warnLine(`Edit '${path}'`);
  const ok = await confirm(`  Proceed?`);
  if (!ok) return 'Edit cancelled by user.';

  try {
    const original = readFileSync(p, 'utf-8');
    if (!original.includes(oldString)) return `Error: old_string not found in ${path}`;
    const updated = original.replace(oldString, newString);
    writeFileSync(p, updated, 'utf-8');
    return `Edited ${path} successfully`;
  } catch (e) {
    return `Error editing file: ${e}`;
  }
}

export async function deleteFile(path: string): Promise<string> {
  const p = resolve(path);
  if (!existsSync(p)) return `Error: file not found: ${path}`;

  warnLine(`Delete '${path}'`);
  const ok = await confirm(`  Proceed?`);
  if (!ok) return 'Deletion cancelled by user.';

  try {
    unlinkSync(p);
    return `Deleted ${path}`;
  } catch (e) {
    return `Error deleting file: ${e}`;
  }
}

export function listDirectory(path: string = '.'): string {
  const p = resolve(path);
  if (!existsSync(p)) return `Error: path not found: ${path}`;
  try {
    const entries = readdirSync(p).sort();
    const lines = entries.map((name) => {
      const full = `${p}/${name}`;
      const isDir = statSync(full).isDirectory();
      const size = isDir ? '' : `  (${statSync(full).size.toLocaleString()} bytes)`;
      return `${isDir ? '📁' : '📄'} ${name}${size}`;
    });
    return lines.length > 0 ? lines.join('\n') : '(empty directory)';
  } catch (e) {
    return `Error listing directory: ${e}`;
  }
}
