/** Severity level of a detected finding. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * How the finding was detected.
 * - `pattern`  — matched a named regex rule
 * - `entropy`  — flagged by Shannon entropy analysis
 * - `context`  — forced by a sensitive filename rule (contextRules)
 */
export type MatchType = 'pattern' | 'entropy' | 'context';

/** A single detected secret finding returned by scanContent(). */
export interface ScanResult {
  /** Path of the file (or descriptor such as "git-diff") that was scanned. */
  file: string;
  /** 1-based line number where the finding occurred. */
  line: number;
  /** How the match was detected. */
  matchType: MatchType;
  /** Identifier of the rule that triggered this finding. */
  ruleId: string;
  /** Human-readable rule name. */
  ruleName: string;
  severity: Severity;
  /**
   * Short redacted preview of the matched text.
   * Raw secret values are never stored here.
   */
  snippet: string;
  /** Shannon entropy score — present for `entropy` and `pattern` match types. */
  entropyScore?: number;
}

/** A named regex detection rule. */
export interface PatternRule {
  id: string;
  name: string;
  /** Pattern must use the `d` flag so match indices are available. */
  regex: RegExp;
  severity: Severity;
}

/** Options that can be passed to scanContent(). */
export interface ScanOptions {
  /** Minimum token length before entropy analysis is applied. Default: 20. */
  entropyMinLength?: number;
  /** Minimum Shannon entropy score to flag a token. Default: 3.5. */
  entropyThreshold?: number;
  /**
   * Contents of a .envshieldignore file, if already read by the caller.
   * When omitted, allowlist checking falls back to inline comments only.
   */
  ignoreFileContent?: string;
}
