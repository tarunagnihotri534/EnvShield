/**
 * Shannon entropy detection.
 *
 * Entropy measures the randomness of a string — high entropy tokens are
 * likely to be secrets even when they don't match a known pattern.
 *
 * Formula: H = -Σ p(c) · log₂(p(c))
 */

export interface EntropyOptions {
  /** Minimum token length to consider. Shorter tokens are ignored. Default: 20. */
  minLength?: number;
  /**
   * Minimum Shannon entropy score to flag a token as suspicious.
   * - Random base64: ~6.0
   * - English prose: ~3.5
   * - UUID (hex):    ~3.4
   * Default: 3.5
   */
  threshold?: number;
}

export const DEFAULT_ENTROPY_OPTIONS: Required<EntropyOptions> = {
  minLength: 20,
  threshold: 3.5,
};

/**
 * Calculates the Shannon entropy (bits per character) of a string.
 * Returns 0 for empty strings.
 */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Splits a line into candidate tokens for entropy analysis.
 *
 * Tokens are extracted by splitting on common delimiters (whitespace, quotes,
 * equals, colons, commas, semicolons) and filtering to contiguous
 * alphanumeric+symbol runs that look like they could be encoded secrets.
 */
export function extractTokens(line: string): string[] {
  // Split on whitespace and common assignment/structural delimiters.
  return line
    .split(/[\s"'`=:,;{}()\[\]<>\\]+/)
    .filter((token) => {
      if (token.length === 0) return false;
      // Must contain at least one letter — pure numbers rarely are secrets.
      if (!/[A-Za-z]/.test(token)) return false;
      // Skip URLs entirely — they score high in entropy but aren't secrets.
      if (token.startsWith('http://') || token.startsWith('https://')) return false;
      // Skip common file path segments.
      if (token.includes('/') && token.split('/').length > 2) return false;
      return true;
    });
}

/**
 * Returns true when the token meets both the length and entropy thresholds.
 */
export function isHighEntropy(token: string, opts: EntropyOptions = {}): boolean {
  const minLength = opts.minLength ?? DEFAULT_ENTROPY_OPTIONS.minLength;
  const threshold = opts.threshold ?? DEFAULT_ENTROPY_OPTIONS.threshold;

  if (token.length < minLength) return false;
  return shannonEntropy(token) >= threshold;
}

/**
 * Scans a single line for high-entropy tokens.
 *
 * @returns Array of {token, entropy} pairs for tokens that exceed the threshold.
 */
export function findHighEntropyTokens(
  line: string,
  opts: EntropyOptions = {},
): Array<{ token: string; entropy: number }> {
  const tokens = extractTokens(line);
  const results: Array<{ token: string; entropy: number }> = [];

  for (const token of tokens) {
    const score = shannonEntropy(token);
    const minLength = opts.minLength ?? DEFAULT_ENTROPY_OPTIONS.minLength;
    const threshold = opts.threshold ?? DEFAULT_ENTROPY_OPTIONS.threshold;

    if (token.length >= minLength && score >= threshold) {
      results.push({ token, entropy: score });
    }
  }

  return results;
}
