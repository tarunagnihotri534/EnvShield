import { describe, it, expect } from 'vitest';
import {
  shannonEntropy,
  extractTokens,
  isHighEntropy,
  findHighEntropyTokens,
  DEFAULT_ENTROPY_OPTIONS,
} from '../entropy.js';

// ─── shannonEntropy ───────────────────────────────────────────────────────────

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single-character string (only one symbol, no information)', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('returns 1 for a perfectly balanced 2-symbol string', () => {
    // "ab" repeated — 50% a, 50% b → entropy = 1 bit
    expect(shannonEntropy('abababab')).toBeCloseTo(1, 5);
  });

  it('returns log2(n) for a string with n distinct characters each appearing once', () => {
    // 8 distinct chars → entropy = log2(8) = 3
    expect(shannonEntropy('abcdefgh')).toBeCloseTo(3, 5);
  });

  it('scores random-looking base64 higher than English prose', () => {
    const secretLike = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const prose = 'the quick brown fox jumps over lazy dog';
    expect(shannonEntropy(secretLike)).toBeGreaterThan(shannonEntropy(prose));
  });

  it('scores a real AWS secret key above 4.0', () => {
    // Known AWS secret key format: 40 base64 chars
    expect(shannonEntropy('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBeGreaterThan(4.0);
  });

  it('scores repeated pattern lower than random', () => {
    expect(shannonEntropy('ababababababababab')).toBeLessThan(shannonEntropy('aB3$xK9mP2!rQzT6y'));
  });
});

// ─── extractTokens ────────────────────────────────────────────────────────────

describe('extractTokens', () => {
  it('splits on whitespace', () => {
    const tokens = extractTokens('foo bar baz');
    expect(tokens).toContain('foo');
    expect(tokens).toContain('bar');
  });

  it('splits on = and :', () => {
    const tokens = extractTokens('API_KEY=abcdefghijklmnop');
    expect(tokens).toContain('API_KEY');
    expect(tokens).toContain('abcdefghijklmnop');
  });

  it('splits on quotes', () => {
    const tokens = extractTokens('secret="mysecretvalue"');
    expect(tokens).toContain('mysecretvalue');
  });

  it('filters out pure-number tokens', () => {
    const tokens = extractTokens('PORT=3000');
    expect(tokens).not.toContain('3000');
  });

  it('filters out empty strings', () => {
    const tokens = extractTokens('  foo  ');
    expect(tokens.every((t) => t.length > 0)).toBe(true);
  });

  it('filters out http/https URLs', () => {
    const tokens = extractTokens('endpoint=https://api.example.com/v1');
    expect(tokens.some((t) => t.startsWith('https://'))).toBe(false);
  });
});

// ─── isHighEntropy ────────────────────────────────────────────────────────────

describe('isHighEntropy', () => {
  it('flags a random base64 string above threshold', () => {
    // 40-char random-looking base64 string
    expect(isHighEntropy('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(true);
  });

  it('does not flag a short token (below minLength)', () => {
    expect(isHighEntropy('abc', { minLength: 20 })).toBe(false);
  });

  it('does not flag low-entropy repeated string', () => {
    expect(isHighEntropy('aaaaaaaaaaaaaaaaaaaaaaaaa', { threshold: 3.5 })).toBe(false);
  });

  it('respects custom minLength', () => {
    // A 10-char random string should be flagged with minLength=5
    const token = 'aB3xK9mP2r';
    expect(isHighEntropy(token, { minLength: 5, threshold: 3.0 })).toBe(true);
    expect(isHighEntropy(token, { minLength: 20 })).toBe(false);
  });

  it('respects custom threshold', () => {
    // 'abcdefgh' has entropy = 3.0; default threshold 3.5 should not flag it
    const token = 'abcdefghijklmnopqrst'; // 20 chars, 20 distinct → entropy = log2(20) ≈ 4.32
    expect(isHighEntropy(token, { threshold: 4.0 })).toBe(true);
    expect(isHighEntropy(token, { threshold: 5.0 })).toBe(false);
  });

  it('uses DEFAULT_ENTROPY_OPTIONS when no opts provided', () => {
    const { minLength, threshold } = DEFAULT_ENTROPY_OPTIONS;
    expect(minLength).toBe(20);
    expect(threshold).toBe(3.5);
  });
});

// ─── findHighEntropyTokens ────────────────────────────────────────────────────

describe('findHighEntropyTokens', () => {
  it('returns findings for a line containing a high-entropy token', () => {
    const line = 'STRIPE_KEY=wJalrXUtnFEMI_K7MDENG_bPxRfiCYEXAMPLEKEYlong';
    const results = findHighEntropyTokens(line, { minLength: 20, threshold: 3.5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      token: expect.any(String),
      entropy: expect.any(Number),
    });
  });

  it('returns empty array for a plain prose line', () => {
    const line = 'const greeting = "hello world";';
    const results = findHighEntropyTokens(line, { minLength: 20, threshold: 3.5 });
    expect(results).toHaveLength(0);
  });

  it('returns entropy score for each found token', () => {
    const line = 'TOKEN=wJalrXUtnFEMI_K7MDENG_bPxRfiCYEXAMPLEKEYlong';
    const results = findHighEntropyTokens(line, { minLength: 20, threshold: 3.5 });
    for (const r of results) {
      expect(r.entropy).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('does not flag a URL as high entropy', () => {
    const line = 'endpoint="https://api.example.com/v1/resource"';
    const results = findHighEntropyTokens(line, { minLength: 20, threshold: 3.5 });
    const urlFindings = results.filter((r) => r.token.startsWith('https://'));
    expect(urlFindings).toHaveLength(0);
  });
});
