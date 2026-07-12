import { describe, it, expect } from 'vitest';
import { PATTERN_RULES, isFalsePositive, FALSE_POSITIVE_PREFIXES } from '../patterns.js';
import type { PatternRule } from '../types.js';

// ─── helper ───────────────────────────────────────────────────────────────────

function findRule(id: string): PatternRule {
  const rule = PATTERN_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule "${id}" not found`);
  return rule;
}

function matches(rule: PatternRule, input: string): string | null {
  const re = new RegExp(rule.regex.source, rule.regex.flags);
  const m = re.exec(input);
  if (!m) return null;
  return m[1] ?? m[0] ?? null;
}

// ─── AWS ──────────────────────────────────────────────────────────────────────

describe('aws-access-key-id', () => {
  const rule = findRule('aws-access-key-id');

  it('matches a real-looking AWS access key', () => {
    expect(matches(rule, 'AKIA' + 'IOSFODNN7EXAMPLE')).toBeTruthy();
    expect(matches(rule, 'AKIA' + 'IOSFODNN7EXAMPLE')).toBe('AKIA' + 'IOSFODNN7EXAMPLE');
  });

  it('matches ASIA prefix (STS keys)', () => {
    expect(matches(rule, 'ASIA' + 'IOSFODNN7EXAMPLE')).toBeTruthy();
  });

  it('does not match a partial key (< 16 chars after prefix)', () => {
    expect(matches(rule, 'AKIASHORT')).toBeNull();
  });

  it('does not match lowercase variant', () => {
    expect(matches(rule, 'akiaiosfodnn7example')).toBeNull();
  });
});

describe('aws-secret-access-key', () => {
  const rule = findRule('aws-secret-access-key');

  it('matches aws_secret_access_key=<40-char base64>', () => {
    expect(
      matches(rule, 'aws_secret_access_key=' + 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
    ).toBeTruthy();
  });

  it('matches uppercase env form', () => {
    expect(
      matches(rule, 'AWS_SECRET_ACCESS_KEY=' + 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
    ).toBeTruthy();
  });

  it('does not match a 39-char value', () => {
    expect(
      matches(rule, 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE'),
    ).toBeNull();
  });
});

// ─── GitHub ───────────────────────────────────────────────────────────────────

describe('github-pat', () => {
  const rule = findRule('github-pat');

  it('matches ghp_ token of correct length', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    expect(matches(rule, token)).toBe(token);
  });

  it('does not match ghp_ that is too short', () => {
    expect(matches(rule, 'ghp_TOOSHORT')).toBeNull();
  });

  it('does not match gho_ prefix', () => {
    expect(matches(rule, 'gho_' + 'A'.repeat(36))).toBeNull();
  });
});

describe('github-oauth', () => {
  const rule = findRule('github-oauth');

  it('matches gho_ token', () => {
    const token = 'gho_' + 'B'.repeat(36);
    expect(matches(rule, token)).toBe(token);
  });
});

describe('github-fine-grained-pat', () => {
  const rule = findRule('github-fine-grained-pat');

  it('matches github_pat_ token of ≥82 chars suffix', () => {
    const token = 'github_pat_' + 'A'.repeat(82);
    expect(matches(rule, token)).toBe(token);
  });

  it('does not match short suffix', () => {
    expect(matches(rule, 'github_pat_' + 'A'.repeat(10))).toBeNull();
  });
});

// ─── Stripe ───────────────────────────────────────────────────────────────────

describe('stripe-secret-key', () => {
  const rule = findRule('stripe-secret-key');

  it('matches sk_live_ key', () => {
    const token = 'sk_live_' + 'a'.repeat(24);
    expect(matches(rule, token)).toBe(token);
  });

  it('does NOT match sk_test_ key (false positive)', () => {
    expect(matches(rule, 'sk_test_' + 'a'.repeat(24))).toBeNull();
  });

  it('does NOT match pk_live_ key (publishable = public)', () => {
    expect(matches(rule, 'pk_live_' + 'a'.repeat(24))).toBeNull();
  });
});

describe('stripe-restricted-key', () => {
  const rule = findRule('stripe-restricted-key');

  it('matches rk_live_ key', () => {
    const token = 'rk_live_' + 'a'.repeat(24);
    expect(matches(rule, token)).toBe(token);
  });

  it('does NOT match rk_test_ key', () => {
    expect(matches(rule, 'rk_test_' + 'a'.repeat(24))).toBeNull();
  });
});

// ─── PEM blocks ───────────────────────────────────────────────────────────────

describe('private-key-pem', () => {
  const rule = findRule('private-key-pem');

  it('matches RSA private key header', () => {
    expect(matches(rule, '-----BEGIN RSA PRIVATE KEY-----')).toBeTruthy();
  });

  it('matches bare PRIVATE KEY header', () => {
    expect(matches(rule, '-----BEGIN PRIVATE KEY-----')).toBeTruthy();
  });

  it('matches EC PRIVATE KEY header', () => {
    expect(matches(rule, '-----BEGIN EC PRIVATE KEY-----')).toBeTruthy();
  });

  it('matches OPENSSH PRIVATE KEY header', () => {
    expect(matches(rule, '-----BEGIN OPENSSH PRIVATE KEY-----')).toBeTruthy();
  });

  it('does not match a PUBLIC KEY header', () => {
    expect(matches(rule, '-----BEGIN PUBLIC KEY-----')).toBeNull();
  });
});

// ─── Slack ────────────────────────────────────────────────────────────────────

describe('slack-bot-token', () => {
  const rule = findRule('slack-bot-token');

  it('matches xoxb- token', () => {
    expect(matches(rule, 'xoxb-000000000000000000000000')).toBeTruthy();
  });

  it('does not match too-short token', () => {
    expect(matches(rule, 'xoxb-short')).toBeNull();
  });
});

describe('slack-webhook', () => {
  const rule = findRule('slack-webhook');

  it('matches a slack webhook URL', () => {
    expect(
      matches(rule, 'https://hooks.slack.com/services/T0/B0/XXX'),
    ).toBeTruthy();
  });
});

// ─── JWT ──────────────────────────────────────────────────────────────────────

describe('jwt', () => {
  const rule = findRule('jwt');
  const sampleJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
    '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('matches a well-formed JWT', () => {
    expect(matches(rule, sampleJwt)).toBeTruthy();
  });

  it('does not match a non-JWT ey... string that is too short', () => {
    expect(matches(rule, 'eyABC.xyz.abc')).toBeNull();
  });
});

// ─── .env assignment ──────────────────────────────────────────────────────────

describe('env-secret-assignment', () => {
  const rule = findRule('env-secret-assignment');

  it('matches SECRET_KEY=<long value>', () => {
    expect(matches(rule, 'SECRET_KEY=supersecretvalue1234567')).toBeTruthy();
  });

  it('matches API_TOKEN with quotes', () => {
    expect(matches(rule, 'API_TOKEN="eyJhbGciOiJIUzI1NiJ9.payload.sig"')).toBeTruthy();
  });

  it('matches export DATABASE_PASSWORD=...', () => {
    expect(matches(rule, 'export DATABASE_PASSWORD=realpassword123456')).toBeTruthy();
  });

  it('does not match a key without a secret-indicating word', () => {
    expect(matches(rule, 'LOG_LEVEL=production')).toBeNull();
  });

  it('does not match a value that is too short (< 16 chars)', () => {
    expect(matches(rule, 'SECRET_KEY=tooshort')).toBeNull();
  });
});

describe('generic-secret-assignment', () => {
  const rule = findRule('generic-secret-assignment');

  it('matches password = "longpassword1234"', () => {
    expect(matches(rule, 'password = "longpassword1234"')).toBeTruthy();
  });

  it('matches api_key: "abcdef1234567890"', () => {
    expect(matches(rule, 'api_key: "abcdef1234567890"')).toBeTruthy();
  });

  it('does not match a very short value', () => {
    expect(matches(rule, 'secret = "short"')).toBeNull();
  });
});

// ─── isFalsePositive ──────────────────────────────────────────────────────────

describe('isFalsePositive', () => {
  it('returns true for known placeholder strings', () => {
    expect(isFalsePositive('your_api_key_here')).toBe(true);
    expect(isFalsePositive('YOUR_API_KEY_HERE')).toBe(true); // case-insensitive
    expect(isFalsePositive('changeme')).toBe(true);
    expect(isFalsePositive('placeholder')).toBe(true);
    expect(isFalsePositive('example_key')).toBe(true);
  });

  it('returns true for Stripe test/public key prefixes', () => {
    expect(isFalsePositive('sk_test_' + 'a'.repeat(24))).toBe(true);
    expect(isFalsePositive('pk_live_' + 'a'.repeat(24))).toBe(true);
    expect(isFalsePositive('pk_test_' + 'a'.repeat(24))).toBe(true);
    expect(isFalsePositive('rk_test_' + 'a'.repeat(24))).toBe(true);
  });

  it('returns false for real-looking secrets', () => {
    expect(isFalsePositive('AKIAIOSFODNN7EXAMPLE')).toBe(false);
    expect(isFalsePositive('ghp_' + 'A'.repeat(36))).toBe(false);
    expect(isFalsePositive('sk_live_' + 'a'.repeat(24))).toBe(false);
  });

  it('covers all FALSE_POSITIVE_PREFIXES', () => {
    for (const prefix of FALSE_POSITIVE_PREFIXES) {
      expect(isFalsePositive(prefix + 'a'.repeat(24))).toBe(true);
    }
  });
});
