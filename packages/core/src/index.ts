// Public API for @envshield/core

export type { ScanResult, Severity, MatchType, PatternRule, ScanOptions } from './types.js';

export { scanContent } from './scanContent.js';

// Expose internals for consumers that want to build custom pipelines.
export { PATTERN_RULES, PLACEHOLDER_ALLOWLIST, FALSE_POSITIVE_PREFIXES, isFalsePositive } from './patterns.js';
export { shannonEntropy, isHighEntropy, findHighEntropyTokens, DEFAULT_ENTROPY_OPTIONS } from './entropy.js';
export type { EntropyOptions } from './entropy.js';
export { isSensitiveFile, contextSeverity, SENSITIVE_FILE_VALUE_PATTERN } from './contextRules.js';
export { parseIgnoreFile, isSuppressed, inlineIgnoreTarget } from './allowlist.js';
export type { AllowlistEntry } from './allowlist.js';
