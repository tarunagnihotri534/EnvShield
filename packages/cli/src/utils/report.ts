import chalk from 'chalk';
import type { ScanResult, Severity } from '@envshield-core/core';

// ─── Severity styling ─────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: chalk.bgRed.white.bold(' CRITICAL '),
  high:     chalk.bgYellow.black.bold('  HIGH   '),
  medium:   chalk.bgBlue.white.bold(' MEDIUM  '),
  low:      chalk.bgGray.white.bold('  LOW    '),
};

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  critical: chalk.red.bold,
  high:     chalk.yellow.bold,
  medium:   chalk.cyan,
  low:      chalk.gray,
};

// ─── Summary helpers ──────────────────────────────────────────────────────────

function countBySeverity(results: ScanResult[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of results) counts[r.severity]++;
  return counts;
}

function isBlocking(results: ScanResult[]): boolean {
  return results.some((r) => r.severity === 'critical' || r.severity === 'high');
}

// ─── Terminal reporter ────────────────────────────────────────────────────────

/**
 * Prints a colorized, human-readable report of scan findings to stdout.
 * Groups findings by file for readability.
 *
 * @returns true when any blocking (critical/high) finding is present.
 */
export function printReport(
  results: ScanResult[],
  opts: { context?: string } = {},
): boolean {
  if (results.length === 0) {
    console.log(chalk.green('✔  No secrets detected.'));
    return false;
  }

  const byFile = new Map<string, ScanResult[]>();
  for (const r of results) {
    const list = byFile.get(r.file) ?? [];
    list.push(r);
    byFile.set(r.file, list);
  }

  if (opts.context) {
    console.log(chalk.bold.underline(`\n  ${opts.context}`));
  }

  for (const [file, fileResults] of byFile) {
    console.log(`\n  ${chalk.bold.underline(file)}`);

    for (const r of fileResults) {
      const badge = SEVERITY_BADGE[r.severity];
      const color = SEVERITY_COLOR[r.severity];
      const location = chalk.dim(`line ${r.line}`);
      const rule = chalk.dim(`[${r.ruleId}]`);
      const name = color(r.ruleName);
      const snippet = chalk.italic.dim(r.snippet);

      console.log(`    ${badge}  ${location}  ${rule}  ${name}`);
      console.log(`             ${snippet}`);
    }
  }

  const counts = countBySeverity(results);
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.red.bold(`${counts.critical} critical`));
  if (counts.high > 0)     parts.push(chalk.yellow.bold(`${counts.high} high`));
  if (counts.medium > 0)   parts.push(chalk.cyan(`${counts.medium} medium`));
  if (counts.low > 0)      parts.push(chalk.gray(`${counts.low} low`));

  console.log(`\n  ${chalk.bold('Total findings:')} ${parts.join(', ')}\n`);

  return isBlocking(results);
}

/**
 * Prints a compact one-line summary for scan-history output
 * where each commit is scanned separately.
 */
export function printCommitReport(
  sha: string,
  subject: string,
  meta: string,
  results: ScanResult[],
): void {
  const short = sha.slice(0, 7);
  const header = chalk.bold.yellow(`  commit ${short}`) + chalk.dim(`  ${subject}`);
  console.log(`\n${header}`);
  console.log(chalk.dim(`         ${meta}`));
  printReport(results, {});
}

// ─── JSON reporter ────────────────────────────────────────────────────────────

/** Serialisable form of a ScanResult for --json output. */
export interface JsonFinding {
  file: string;
  line: number;
  severity: Severity;
  ruleId: string;
  ruleName: string;
  matchType: string;
  snippet: string;
  entropyScore?: number;
  commit?: string;
}

/** Converts a ScanResult to the JSON-serialisable shape. */
export function toJsonFinding(r: ScanResult, commit?: string): JsonFinding {
  const out: JsonFinding = {
    file: r.file,
    line: r.line,
    severity: r.severity,
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    matchType: r.matchType,
    snippet: r.snippet,
  };
  if (r.entropyScore !== undefined) out.entropyScore = r.entropyScore;
  if (commit !== undefined) out.commit = commit;
  return out;
}

/**
 * Outputs all findings as a JSON array to stdout.
 */
export function printJsonReport(findings: JsonFinding[]): void {
  console.log(JSON.stringify(findings, null, 2));
}
