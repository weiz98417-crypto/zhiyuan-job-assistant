import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('browser CSRF mutation wiring', () => {
  it('installs the CSRF-aware fetch boundary before authenticated pages render', () => {
    const gate = fs.readFileSync(path.join(process.cwd(), 'src/components/shell/AuthGate.tsx'), 'utf8');
    const client = fs.readFileSync(path.join(process.cwd(), 'src/lib/security/csrf-fetch.ts'), 'utf8');

    expect(gate).toContain('installCsrfFetch');
    expect(client).toContain("'/api/auth/csrf'");
    expect(client).toContain("headers.set('X-CSRF-Token'");
    expect(client).toContain("['POST', 'PUT', 'PATCH', 'DELETE']");
  });
});
