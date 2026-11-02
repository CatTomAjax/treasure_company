import { existsSync } from 'node:fs';
export function loadEnvironment() {
  // Explicit process variables win, including isolated test database URLs.
  for (const file of ['.env', '.dev.vars']) {
    if (!existsSync(file)) continue;
    const existing = { ...process.env };
    process.loadEnvFile(file);
    Object.assign(process.env, existing);
  }
}
