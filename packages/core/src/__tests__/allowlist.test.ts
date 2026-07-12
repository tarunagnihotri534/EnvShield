import { describe, it, expect } from 'vitest';
import {
  parseIgnoreFile,
  isSuppressedByAllowlist,
  inlineIgnoreTarget,
  isSuppressed,
} from '../allowlist.js';

// ─── parseIgnoreFile ──────────────────────────────────────────────────────────

describe('parseIgnoreFile', () => {
  it('returns empty array for blank/comment-only content', () => {
    const entries = parseIgnoreFile('# this is a comment\n\n  \n');
    expect(entries).toHaveLength(0);
  });

  it('parses a glob file pattern', () => {
    const entries = parseIgnoreFile('fixtures/**');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.raw).toBe('fixtures/**');
  });

  it('parses multiple entries', () => {
    const content = `
# ignore test fixtures
fixtures/**
*.test.ts
`.trim();
    const entries = parseIgnoreFile(content);
    expect(entries).toHaveLength(2);
  });

  it('parses a rule-ID-only entry (global rule suppression)', () => {
    const entries = parseIgnoreFile('aws-access-key-id');
    expect(entries).toHaveLength(1);
    // Should match any file but only for the named rule
    expect(entries[0]!.matches('anything.ts', 'aws-access-key-id')).toBe(true);
    expect(entries[0]!.matches('anything.ts', 'github-pat')).toBe(false);
  });

  it('parses a file:ruleId scoped entry', () => {
    const entries = parseIgnoreFile('src/config.ts:aws-access-key-id');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.matches('src/config.ts', 'aws-access-key-id')).toBe(true);
    expect(entries[0]!.matches('src/other.ts', 'aws-access-key-id')).toBe(false);
    expect(entries[0]!.matches('src/config.ts', 'github-pat')).toBe(false);
  });
});

// ─── isSuppressedByAllowlist ──────────────────────────────────────────────────

describe('isSuppressedByAllowlist', () => {
  it('suppresses a file matching a glob pattern', () => {
    const entries = parseIgnoreFile('fixtures/**');
    expect(isSuppressedByAllowlist('fixtures/sample.env', 'aws-access-key-id', entries)).toBe(true);
  });

  it('suppresses a specific ruleId globally', () => {
    const entries = parseIgnoreFile('entropy');
    expect(isSuppressedByAllowlist('any/file.ts', 'entropy', entries)).toBe(true);
    expect(isSuppressedByAllowlist('any/file.ts', 'github-pat', entries)).toBe(false);
  });

  it('suppresses *.test.ts files', () => {
    const entries = parseIgnoreFile('*.test.ts');
    expect(isSuppressedByAllowlist('src/auth.test.ts', 'github-pat', entries)).toBe(true);
    expect(isSuppressedByAllowlist('src/auth.ts', 'github-pat', entries)).toBe(false);
  });

  it('returns false when no entries match', () => {
    const entries = parseIgnoreFile('fixtures/**');
    expect(isSuppressedByAllowlist('src/real.ts', 'github-pat', entries)).toBe(false);
  });

  it('returns false for empty allowlist', () => {
    expect(isSuppressedByAllowlist('any/file.ts', 'github-pat', [])).toBe(false);
  });

  it('matches basename for exact filename entries', () => {
    const entries = parseIgnoreFile('fixtures/**');
    expect(isSuppressedByAllowlist('project/fixtures/creds.json', 'context', entries)).toBe(true);
  });
});

// ─── inlineIgnoreTarget ───────────────────────────────────────────────────────

describe('inlineIgnoreTarget', () => {
  it('returns * for bare # envshield-ignore', () => {
    expect(inlineIgnoreTarget('const key = "abc"; # envshield-ignore')).toBe('*');
  });

  it('returns * for // envshield-ignore style (other comment chars)', () => {
    // Our regex anchors to # — JS-style comments are not supported by design
    expect(inlineIgnoreTarget('const key = "abc"; // envshield-ignore')).toBeNull();
  });

  it('returns the specific ruleId for # envshield-ignore:<ruleId>', () => {
    expect(inlineIgnoreTarget('API_KEY=secret123 # envshield-ignore:aws-access-key-id')).toBe(
      'aws-access-key-id',
    );
  });

  it('is case-insensitive', () => {
    expect(inlineIgnoreTarget('key=val # ENVSHIELD-IGNORE')).toBe('*');
    expect(inlineIgnoreTarget('key=val # EnvShield-Ignore:github-pat')).toBe('github-pat');
  });

  it('returns null when no inline ignore comment is present', () => {
    expect(inlineIgnoreTarget('const key = "abc"; # just a normal comment')).toBeNull();
    expect(inlineIgnoreTarget('API_KEY=realvalue')).toBeNull();
  });

  it('handles leading whitespace in the comment', () => {
    expect(inlineIgnoreTarget('value=x  #   envshield-ignore')).toBe('*');
  });
});

// ─── isSuppressed ─────────────────────────────────────────────────────────────

describe('isSuppressed', () => {
  it('suppresses when bare inline ignore is present (all rules)', () => {
    const line = 'SECRET=abc123 # envshield-ignore';
    expect(isSuppressed(line, 'config.ts', 'aws-access-key-id', [])).toBe(true);
    expect(isSuppressed(line, 'config.ts', 'github-pat', [])).toBe(true);
  });

  it('suppresses only the specific rule with scoped inline ignore', () => {
    const line = 'SECRET=abc123 # envshield-ignore:github-pat';
    expect(isSuppressed(line, 'config.ts', 'github-pat', [])).toBe(true);
    expect(isSuppressed(line, 'config.ts', 'aws-access-key-id', [])).toBe(false);
  });

  it('suppresses via allowlist entries', () => {
    const entries = parseIgnoreFile('*.test.ts');
    const line = 'const key = "' + 'sk_live_' + '000000000000000000000000' + '";';
    expect(isSuppressed(line, 'auth.test.ts', 'stripe-secret-key', entries)).toBe(true);
    expect(isSuppressed(line, 'auth.ts', 'stripe-secret-key', entries)).toBe(false);
  });

  it('returns false when nothing suppresses the finding', () => {
    const line = 'SECRET=realvalue12345678';
    expect(isSuppressed(line, 'config.ts', 'env-secret-assignment', [])).toBe(false);
  });

  it('checks against both full path and basename', () => {
    const entries = parseIgnoreFile('config.ts:context');
    const line = 'DB_PASS=realpassword1234';
    // Full path match
    expect(isSuppressed(line, 'src/config.ts', 'context', entries)).toBe(true);
    // Basename match
    expect(isSuppressed(line, 'config.ts', 'context', entries)).toBe(true);
    // Different file — not suppressed
    expect(isSuppressed(line, 'src/other.ts', 'context', entries)).toBe(false);
  });
});
