import { describe, it, expect } from 'vitest';
import { isSensitiveFile, contextSeverity, SENSITIVE_FILE_VALUE_PATTERN } from '../contextRules.js';

// ─── isSensitiveFile ──────────────────────────────────────────────────────────

describe('isSensitiveFile', () => {
  // Exact matches
  it('flags .env', () => expect(isSensitiveFile('.env')).toBe(true));
  it('flags .env.local', () => expect(isSensitiveFile('.env.local')).toBe(true));
  it('flags .env.production', () => expect(isSensitiveFile('.env.production')).toBe(true));
  it('flags .env.staging', () => expect(isSensitiveFile('.env.staging')).toBe(true));
  it('flags .env.test', () => expect(isSensitiveFile('.env.test')).toBe(true));
  it('flags credentials.json', () => expect(isSensitiveFile('credentials.json')).toBe(true));
  it('flags credentials.yaml', () => expect(isSensitiveFile('credentials.yaml')).toBe(true));
  it('flags secrets.json', () => expect(isSensitiveFile('secrets.json')).toBe(true));
  it('flags service-account.json', () => expect(isSensitiveFile('service-account.json')).toBe(true));
  it('flags id_rsa', () => expect(isSensitiveFile('id_rsa')).toBe(true));
  it('flags id_ed25519', () => expect(isSensitiveFile('id_ed25519')).toBe(true));
  it('flags .netrc', () => expect(isSensitiveFile('.netrc')).toBe(true));

  // Extension-based
  it('flags file.pem', () => expect(isSensitiveFile('server.pem')).toBe(true));
  it('flags file.key', () => expect(isSensitiveFile('private.key')).toBe(true));
  it('flags file.p12', () => expect(isSensitiveFile('cert.p12')).toBe(true));
  it('flags file.pfx', () => expect(isSensitiveFile('cert.pfx')).toBe(true));
  it('flags file.ppk', () => expect(isSensitiveFile('putty.ppk')).toBe(true));
  it('flags file.jks', () => expect(isSensitiveFile('keystore.jks')).toBe(true));

  // Full paths — should check basename only
  it('flags full path to .env', () =>
    expect(isSensitiveFile('/home/user/project/.env')).toBe(true));
  it('flags full path to credentials.json', () =>
    expect(isSensitiveFile('/var/app/config/credentials.json')).toBe(true));
  it('flags nested .env.production', () =>
    expect(isSensitiveFile('apps/backend/.env.production')).toBe(true));

  // .env.* prefix rule
  it('flags arbitrary .env.* variants', () => {
    expect(isSensitiveFile('.env.custom')).toBe(true);
    expect(isSensitiveFile('.env.docker')).toBe(true);
  });

  // Should NOT flag
  it('does not flag a regular .ts file', () =>
    expect(isSensitiveFile('src/utils.ts')).toBe(false));
  it('does not flag package.json', () =>
    expect(isSensitiveFile('package.json')).toBe(false));
  it('does not flag README.md', () =>
    expect(isSensitiveFile('README.md')).toBe(false));
  it('does not flag a .env-example file (common safe convention)', () =>
    // .env-example starts with ".env-" not ".env." — should not be flagged
    // NOTE: our prefix check is ".env." so this is intentionally safe
    expect(isSensitiveFile('.env-example')).toBe(false));
  it('does not flag environment.ts', () =>
    expect(isSensitiveFile('environment.ts')).toBe(false));
});

// ─── contextSeverity ─────────────────────────────────────────────────────────

describe('contextSeverity', () => {
  it('always returns high severity for sensitive files', () => {
    expect(contextSeverity('.env')).toBe('high');
    expect(contextSeverity('credentials.json')).toBe('high');
    expect(contextSeverity('server.pem')).toBe('high');
  });
});

// ─── SENSITIVE_FILE_VALUE_PATTERN ─────────────────────────────────────────────

describe('SENSITIVE_FILE_VALUE_PATTERN', () => {
  function test(line: string): RegExpExecArray | null {
    const re = new RegExp(SENSITIVE_FILE_VALUE_PATTERN.source, 'g');
    return re.exec(line);
  }

  it('matches KEY=longvalue in a .env line', () => {
    const m = test('DATABASE_URL=postgres://user:password@host/db');
    expect(m).toBeTruthy();
    expect(m![1]).toBe('DATABASE_URL');
  });

  it('matches quoted values', () => {
    const m = test('SECRET_KEY="mysupersecretvalue"');
    expect(m).toBeTruthy();
    expect(m![2]).toBe('mysupersecretvalue');
  });

  it('matches export KEY=value', () => {
    const m = test('export API_TOKEN=eyJhbGciOiJIUzI1NiJ9');
    expect(m).toBeTruthy();
  });

  it('does not match empty values', () => {
    expect(test('SECRET=')).toBeNull();
    expect(test('KEY=""')).toBeNull();
  });

  it('does not match short values (< 8 chars)', () => {
    expect(test('KEY=short')).toBeNull();
  });

  it('does not match comment-only lines', () => {
    expect(test('# DATABASE_URL=postgres://...')).toBeNull();
  });
});
