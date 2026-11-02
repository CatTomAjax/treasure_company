import { readFileSync } from 'node:fs';
// Optional preload for running the retained suites against an authenticated,
// isolated local test server. Never supplies credentials to another host.
if (process.env.TEST_SESSION_FILE) {
  const base = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3004'),
    cookie = readFileSync(process.env.TEST_SESSION_FILE, 'utf8').trim(),
    original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.origin !== base.origin) return original(input, init);
    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has('Cookie')) headers.set('Cookie', cookie);
    return original(input, { ...init, headers });
  };
}
