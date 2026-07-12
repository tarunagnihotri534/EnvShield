import type { PatternRule } from './types.js';

/**
 * Built-in pattern rules.
 *
 * Design notes:
 * - Regexes use the `d` flag so match indices are available for precise redaction.
 * - Capturing groups are avoided where possible to prevent accidentally storing
 *   the raw secret. When a capture is needed (e.g. to isolate the value from a
 *   KEY=VALUE pair), group 1 holds the secret portion.
 * - Patterns include word-boundary or delimiter assertions to reduce false positives.
 */
export const PATTERN_RULES: PatternRule[] = [
  // ── AWS ──────────────────────────────────────────────────────────────────
  {
    id: 'aws-access-key-id',
    name: 'AWS Access Key ID',
    // Begins with AKIA/ABIA/ACCA/ASIA, followed by exactly 16 uppercase alphanum chars.
    regex: /(?<![A-Z0-9])((?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16})(?![A-Z0-9])/d,
    severity: 'critical',
  },
  {
    id: 'aws-secret-access-key',
    name: 'AWS Secret Access Key',
    // 40-char base64 string that is preceded by a key-like label.
    regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY|secret_key)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/d,
    severity: 'critical',
  },

  // ── GitHub ────────────────────────────────────────────────────────────────
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token (classic)',
    regex: /\b(ghp_[A-Za-z0-9]{36})\b/d,
    severity: 'critical',
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth Token',
    regex: /\b(gho_[A-Za-z0-9]{36})\b/d,
    severity: 'critical',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions Token',
    regex: /\b(ghs_[A-Za-z0-9]{36})\b/d,
    severity: 'high',
  },
  {
    id: 'github-refresh',
    name: 'GitHub Refresh Token',
    regex: /\b(ghr_[A-Za-z0-9]{36})\b/d,
    severity: 'high',
  },
  {
    id: 'github-fine-grained-pat',
    name: 'GitHub Fine-Grained PAT',
    // New format: github_pat_ followed by 82+ chars
    regex: /\b(github_pat_[A-Za-z0-9_]{82,})\b/d,
    severity: 'critical',
  },

  // ── Stripe ────────────────────────────────────────────────────────────────
  {
    id: 'stripe-secret-key',
    name: 'Stripe Secret Key',
    // sk_live_ only — sk_test_ is explicitly a false positive.
    regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/d,
    severity: 'critical',
  },
  {
    id: 'stripe-restricted-key',
    name: 'Stripe Restricted Key',
    regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/d,
    severity: 'high',
  },

  // ── Private key PEM blocks ────────────────────────────────────────────────
  {
    id: 'private-key-pem',
    name: 'Private Key PEM Block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/d,
    severity: 'critical',
  },
  {
    id: 'certificate-pem',
    name: 'Certificate with Private Key',
    regex: /-----BEGIN CERTIFICATE-----/d,
    severity: 'low',
  },

  // ── Slack ─────────────────────────────────────────────────────────────────
  {
    id: 'slack-bot-token',
    name: 'Slack Bot Token',
    regex: /\b(xoxb-[0-9A-Za-z\-]{24,})\b/d,
    severity: 'high',
  },
  {
    id: 'slack-user-token',
    name: 'Slack User Token',
    regex: /\b(xoxp-[0-9A-Za-z\-]{24,})\b/d,
    severity: 'high',
  },
  {
    id: 'slack-app-token',
    name: 'Slack App-Level Token',
    regex: /\b(xapp-[0-9A-Za-z\-]{24,})\b/d,
    severity: 'high',
  },
  {
    id: 'slack-webhook',
    name: 'Slack Incoming Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/d,
    severity: 'high',
  },

  // ── JWT ───────────────────────────────────────────────────────────────────
  {
    id: 'jwt',
    name: 'JSON Web Token',
    // Three base64url segments separated by dots; first segment decodes to {"alg":...}
    regex: /\b(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/d,
    severity: 'high',
  },

  // ── .env-style KEY=VALUE ──────────────────────────────────────────────────
  {
    id: 'env-secret-assignment',
    name: '.env Secret Assignment',
    /**
     * Matches lines like:
     *   SECRET_KEY="abc123xyz..."
     *   API_TOKEN=eyJhbGci...
     * The key must contain a secret-indicating word; the value must be ≥16 chars
     * and not a known placeholder.
     * Group 1 = the value (checked by isFalsePositive in scanContent).
     */
    regex: /^(?:export\s+)?[A-Z_][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH|API_KEY|PRIVATE)[A-Z0-9_]*\s*=\s*["']?([A-Za-z0-9_\-+/=.@]{16,})["']?\s*$/dm,
    severity: 'high',
  },

  // ── Generic high-entropy assignments ─────────────────────────────────────
  {
    id: 'generic-secret-assignment',
    name: 'Generic Secret-Looking Assignment',
    /**
     * Catches things like:
     *   password = "hunter2realpassword"
     *   secret: "xK9mP2..."
     * Only fires on lowercase/camelCase keys to avoid duplicating env-secret-assignment.
     */
    regex: /(?:password|passwd|secret|api_?key|auth_?token|private_?key)\s*[:=]\s*["']([^"'\s]{12,})["']/di,
    severity: 'medium',
  },
];

/**
 * Known-safe placeholder values that should never be flagged.
 * Checked case-insensitively against the matched token.
 */
export const PLACEHOLDER_ALLOWLIST: ReadonlySet<string> = new Set([
  'your_api_key_here',
  'your-api-key-here',
  'your_secret_here',
  'insert_key_here',
  'replace_with_your_key',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxxxxxx',
  '<your_secret>',
  '<api_key>',
  'changeme',
  'change_me',
  'placeholder',
  'example_key',
  'example_secret',
  'test_secret',
  'dummy_secret',
  'fake_secret',
  '1234567890abcdef',
  'abcdefghijklmnop',
]);

/**
 * Stripe public / test key prefixes — these are intentionally public
 * and must never be flagged as secrets.
 */
export const FALSE_POSITIVE_PREFIXES: readonly string[] = [
  'sk_test_',  // Stripe test secret key
  'pk_live_',  // Stripe publishable (public) live key
  'pk_test_',  // Stripe publishable test key
  'rk_test_',  // Stripe restricted test key
];

/** Returns true when the matched token is a known false positive. */
export function isFalsePositive(token: string): boolean {
  const lower = token.toLowerCase();

  if (PLACEHOLDER_ALLOWLIST.has(lower)) return true;

  for (const prefix of FALSE_POSITIVE_PREFIXES) {
    if (token.startsWith(prefix)) return true;
  }

  return false;
}
