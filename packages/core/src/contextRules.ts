import { basename } from 'node:path';
import type { Severity } from './types.js';

/**
 * Context rules force findings on sensitive filenames regardless of whether
 * the content matches a known pattern. The rationale: if a secret is in
 * credentials.json or a .pem file, every non-empty assignment is suspicious.
 */

export interface ContextRule {
  id: string;
  description: string;
  severity: Severity;
  /** Returns true when this rule applies to the given filename. */
  matches(filename: string): boolean;
}

/** Exact filenames (basename, case-insensitive) that are always sensitive. */
const SENSITIVE_EXACT: ReadonlySet<string> = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.staging',
  '.env.test',
  '.env.test.local',
  'credentials.json',
  'credentials.yml',
  'credentials.yaml',
  'secrets.json',
  'secrets.yml',
  'secrets.yaml',
  'service-account.json',
  'serviceaccount.json',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  'known_hosts',
]);

/** Glob-style suffix patterns for sensitive files. */
const SENSITIVE_EXTENSIONS: readonly string[] = [
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.pkcs12',
  '.crt',
  '.cer',
  '.der',
  '.ppk',    // PuTTY private key
  '.jks',    // Java KeyStore
  '.keystore',
];

/** Prefix patterns applied to the basename. */
const SENSITIVE_PREFIXES: readonly string[] = [
  '.env.',   // catches .env.anything
];

/**
 * Checks whether the given filename (full path or basename) is a
 * context-sensitive file that should be flagged more aggressively.
 */
export function isSensitiveFile(filename: string): boolean {
  const base = basename(filename).toLowerCase();

  if (SENSITIVE_EXACT.has(base)) return true;

  for (const ext of SENSITIVE_EXTENSIONS) {
    if (base.endsWith(ext)) return true;
  }

  for (const prefix of SENSITIVE_PREFIXES) {
    if (base.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Returns the severity override for a sensitive file.
 * Context-rule findings are always at least 'high'.
 */
export function contextSeverity(_filename: string): Severity {
  return 'high';
}

/**
 * Regex applied to lines inside sensitive files to find KEY=VALUE assignments
 * that look like they contain a real value (not a placeholder or empty string).
 *
 * Group 1: key name
 * Group 2: value
 */
export const SENSITIVE_FILE_VALUE_PATTERN =
  /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^\s"'#]{8,})["']?/dm;
