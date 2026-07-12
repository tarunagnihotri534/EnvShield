import type { ScanOptions, ScanResult } from './types.js';
import { PATTERN_RULES, isFalsePositive } from './patterns.js';
import { findHighEntropyTokens } from './entropy.js';
import {
  isSensitiveFile,
  contextSeverity,
  SENSITIVE_FILE_VALUE_PATTERN,
} from './contextRules.js';
import { parseIgnoreFile, isSuppressed } from './allowlist.js';

const DEFAULT_OPTS: Required<ScanOptions> = {
  entropyMinLength: 20,
  entropyThreshold: 3.5,
  ignoreFileContent: '',
};

/**
 * Redacts a matched secret token for safe display.
 *
 * Keeps the first 3 and last 3 characters; replaces the middle with `***`.
 * For very short tokens (< 8 chars) the entire value is masked.
 */
function redact(value: string): string {
  if (value.length < 8) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

/**
 * Scans text content for secrets using three layers:
 *  1. Named pattern rules (regex)
 *  2. Shannon entropy analysis
 *  3. Context rules (forced flagging in sensitive filenames)
 *
 * Findings are deduplicated by `file:line:ruleId` before being returned.
 *
 * @param content  - Raw text to scan (file contents, git diff, etc.)
 * @param filename - File path or descriptor; used for context rules and reporting
 * @param opts     - Optional tuning parameters
 */
export function scanContent(
  content: string,
  filename: string,
  opts: ScanOptions = {},
): ScanResult[] {
  const options: Required<ScanOptions> = { ...DEFAULT_OPTS, ...opts };

  const allowlistEntries = options.ignoreFileContent
    ? parseIgnoreFile(options.ignoreFileContent)
    : [];

  const sensitive = isSensitiveFile(filename);
  const lines = content.split('\n');
  const results: ScanResult[] = [];
  const seen = new Set<string>();

  function emit(result: ScanResult): void {
    const key = `${result.file}:${result.line}:${result.ruleId}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(result);
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const lineNumber = i + 1;

    // ── Layer 1: pattern matching ──────────────────────────────────────────
    for (const rule of PATTERN_RULES) {
      // Clone with `g` to allow exec() to iterate matches on the same line.
      const re = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g');

      let match: RegExpExecArray | null;
      while ((match = re.exec(rawLine)) !== null) {
        // Prefer the first capture group (the secret value) if present.
        const token = match[1] ?? match[0] ?? '';

        if (isFalsePositive(token)) continue;
        if (isSuppressed(rawLine, filename, rule.id, allowlistEntries)) continue;

        emit({
          file: filename,
          line: lineNumber,
          matchType: 'pattern',
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          snippet: redact(token),
        });
      }
    }

    // ── Layer 2: entropy analysis ──────────────────────────────────────────
    // Collect the exact token strings already caught by pattern rules on this line,
    // so we can skip entropy findings that are substrings of a pattern match.
    const patternTokensThisLine = new Set(
      results
        .filter((r) => r.line === lineNumber && r.matchType === 'pattern')
        .map((r) => r.snippet),
    );

    const highEntropyTokens = findHighEntropyTokens(rawLine, {
      minLength: options.entropyMinLength,
      threshold: options.entropyThreshold,
    });

    for (const { token, entropy } of highEntropyTokens) {
      if (isFalsePositive(token)) continue;
      if (isSuppressed(rawLine, filename, 'entropy', allowlistEntries)) continue;

      // Skip only if this specific token was already reported by a pattern rule.
      // Compare against redacted snippets to avoid storing raw values.
      const tokenSnippet = redact(token);
      if (patternTokensThisLine.has(tokenSnippet)) continue;

      emit({
        file: filename,
        line: lineNumber,
        matchType: 'entropy',
        ruleId: 'entropy',
        ruleName: 'High Entropy String',
        severity: 'medium',
        snippet: tokenSnippet,
        entropyScore: Math.round(entropy * 100) / 100,
      });
    }

    // ── Layer 3: context rules (sensitive filenames) ───────────────────────
    if (sensitive) {
      // Re-run the sensitive-value pattern against this line.
      const cvRe = new RegExp(
        SENSITIVE_FILE_VALUE_PATTERN.source,
        SENSITIVE_FILE_VALUE_PATTERN.flags.includes('g')
          ? SENSITIVE_FILE_VALUE_PATTERN.flags
          : SENSITIVE_FILE_VALUE_PATTERN.flags + 'g',
      );

      let ctxMatch: RegExpExecArray | null;
      while ((ctxMatch = cvRe.exec(rawLine)) !== null) {
        const key = ctxMatch[1] ?? '';
        const value = ctxMatch[2] ?? '';

        if (isFalsePositive(value)) continue;
        if (isSuppressed(rawLine, filename, 'context', allowlistEntries)) continue;

        // Don't double-report if a pattern rule already caught this line/value.
        const alreadyReported = results.some(
          (r) => r.line === lineNumber && rawLine.includes(value),
        );
        if (alreadyReported) continue;

        emit({
          file: filename,
          line: lineNumber,
          matchType: 'context',
          ruleId: 'context',
          ruleName: `Sensitive file assignment (${key})`,
          severity: contextSeverity(filename),
          snippet: `${key}=${redact(value)}`,
        });
      }
    }
  }

  return results;
}
