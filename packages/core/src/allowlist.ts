/**
 * Allowlist / suppression logic.
 *
 * Two suppression mechanisms:
 * 1. .envshieldignore  — gitignore-style file; each line is a glob pattern
 *    matched against `file:lineNumber:ruleId` or just the file path.
 * 2. Inline comments   — `# envshield-ignore` anywhere on the source line
 *    suppresses all findings on that line.
 *    `# envshield-ignore:<ruleId>` suppresses only the named rule.
 */

import { basename } from 'node:path';

export interface AllowlistEntry {
  /** Original raw pattern string from the ignore file. */
  raw: string;
  /**
   * Compiled matcher function.
   * Returns true when the entry suppresses a finding described by the key.
   */
  matches(file: string, ruleId: string): boolean;
}

const INLINE_IGNORE_RE = /#+\s*envshield-ignore(?::([A-Za-z0-9_-]+))?\s*$/i;

/**
 * Parses a .envshieldignore file into AllowlistEntry objects.
 *
 * Supported line formats:
 *   # comment               — ignored
 *   *.test.ts               — suppresses all rules in matching files
 *   fixtures/**             — suppresses all rules under a directory
 *   aws-access-key-id       — suppresses a specific rule in all files
 *   src/config.ts:aws-access-key-id — suppresses a rule in a specific file
 */
export function parseIgnoreFile(content: string): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    entries.push(buildEntry(line));
  }

  return entries;
}

function buildEntry(raw: string): AllowlistEntry {
  // Format: "path/pattern:ruleId"  — file-scoped rule suppression
  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx > 0) {
    const filePart = raw.slice(0, colonIdx);
    const rulePart = raw.slice(colonIdx + 1);

    // Only treat as file:rule if rulePart looks like a rule ID (no slashes/dots)
    if (/^[A-Za-z0-9_-]+$/.test(rulePart)) {
      const fileMatcher = buildGlobMatcher(filePart);
      return {
        raw,
        matches: (file, ruleId) => ruleId === rulePart && fileMatcher(file),
      };
    }
  }

  // Heuristic: if the pattern contains no slashes, dots, or glob wildcards it
  // is treated as a rule ID — suppresses that rule globally across all files.
  // Covers both hyphenated IDs (aws-access-key-id) and plain words (entropy, context).
  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    return {
      raw,
      matches: (_file, ruleId) => ruleId === raw,
    };
  }

  // Otherwise treat as a glob file pattern — suppresses all rules in matching files.
  const fileMatcher = buildGlobMatcher(raw);
  return {
    raw,
    matches: (file, _ruleId) => fileMatcher(file),
  };
}

/**
 * Converts a simple glob pattern (supporting `*`, `**`, `?`) into a
 * file-matching function.
 *
 * We implement a minimal glob without pulling in a dependency — only the
 * patterns actually needed for an ignore file.
 */
function buildGlobMatcher(pattern: string): (file: string) => boolean {
  // Normalize path separators
  const norm = pattern.replace(/\\/g, '/');

  // Build a regex from the glob
  const regexStr = norm
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials except * and ?
    .replace(/\*\*\//g, '(?:.+/)?')         // **/ → match any path prefix
    .replace(/\*\*/g, '.*')                  // ** → match anything
    .replace(/\*/g, '[^/]*')                 // * → match within segment
    .replace(/\?/g, '[^/]');                 // ? → single non-separator char

  const re = new RegExp(`(^|/)${regexStr}($|/)`, 'i');
  return (file: string) => re.test(file.replace(/\\/g, '/'));
}

/**
 * Checks whether a specific finding should be suppressed by the parsed allowlist.
 */
export function isSuppressedByAllowlist(
  file: string,
  ruleId: string,
  entries: AllowlistEntry[],
): boolean {
  return entries.some((e) => e.matches(file, ruleId));
}

/**
 * Checks whether a line carries an inline `# envshield-ignore` comment.
 *
 * @returns `null` when not suppressed, `'*'` to suppress all rules on this
 *          line, or the specific ruleId string to suppress only that rule.
 */
export function inlineIgnoreTarget(line: string): string | null {
  const m = INLINE_IGNORE_RE.exec(line);
  if (m === null) return null;
  return m[1] ?? '*';
}

/**
 * Returns true when the finding on `line` for `ruleId` is suppressed by an
 * inline comment, considering the allowlist entries too.
 */
export function isSuppressed(
  line: string,
  file: string,
  ruleId: string,
  entries: AllowlistEntry[],
): boolean {
  const inlineTarget = inlineIgnoreTarget(line);
  if (inlineTarget === '*' || inlineTarget === ruleId) return true;

  return isSuppressedByAllowlist(basename(file), ruleId, entries) ||
    isSuppressedByAllowlist(file, ruleId, entries);
}
