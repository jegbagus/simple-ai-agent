import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = join(__dirname, '../../memory/sessions.json');

function load(): Record<string, string> {
  if (!existsSync(MEMORY_FILE)) return {};
  try {
    return JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data: Record<string, string>): void {
  mkdirSync(dirname(MEMORY_FILE), { recursive: true });
  writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function memoryRead(): string {
  const data = load();
  const entries = Object.entries(data);
  if (entries.length === 0) return '(no memories stored)';
  return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
}

export function memoryWrite(key: string, value: string): string {
  const data = load();
  data[key] = value;
  save(data);
  return `Memory saved: ${key} = ${value}`;
}
