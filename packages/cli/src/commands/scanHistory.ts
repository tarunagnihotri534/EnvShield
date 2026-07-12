import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { scanContent } from '@envshield-core/core';
import type { ScanResult } from '@envshield-core/core';
import {
  getCommitList,
  getCommitDiff,
  getCommitSubject,
  getCommitMeta,
  getRepoRoot,
  isGitRepo,
  GitError,
} from '../utils/git.js';
import { parseDiff, groupByFile } from '../utils/diff.js';
import {
  printCommitReport,
  printJsonReport,
  toJsonFinding,
  type JsonFinding,
} from '../utils/report.js';

/** Options accepted by `envshield scan-history`. */
interface ScanHistoryOpts {
  cwd: string;
  since?: string;
  entropy: boolean;
  threshold: string;
  json: boolean;
  minSeverity: string;
  maxCommits: string;
}

/**
 * Registers the `envshield scan-history` command.
 *
 * Walks git log commit by commit, scans each diff for secrets, and reports
 * any findings. Does NOT exit with code 1 — this is an advisory scan only.
 */
export function scanHistoryCommand(program: Command): void {
  program
    .command('scan-history')
    .description('Scan full git history for previously committed secrets (advisory)')
    .option('--cwd <path>', 'Git repo root to scan', process.cwd())
    .option('--since <ref>', 'Only scan commits newer than this ref or date (e.g. "1 year ago", "v1.0.0")')
    .option('--entropy', 'Enable Shannon entropy analysis', false)
    .option('--threshold <score>', 'Entropy score threshold (default: 3.5)', '3.5')
    .option('--json', 'Output all findings as a JSON array', false)
    .option(
      '--min-severity <level>',
      'Minimum severity to report: critical|high|medium|low (default: medium)',
      'medium',
    )
    .option(
      '--max-commits <n>',
      'Maximum number of commits to scan (safety limit, default: 500)',
      '500',
    )
    .action(async (opts: ScanHistoryOpts) => {
      const cwd = resolve(opts.cwd);

      if (!isGitRepo(cwd)) {
        console.error(chalk.red('✖  Not a git repository.'));
        process.exit(1);
      }

      // ── Load .envshieldignore ─────────────────────────────────────────────
      let ignoreFileContent = '';
      let repoRoot = cwd;
      try {
        repoRoot = getRepoRoot(cwd);
        const ignorePath = join(repoRoot, '.envshieldignore');
        if (existsSync(ignorePath)) {
          ignoreFileContent = readFileSync(ignorePath, 'utf-8');
        }
      } catch {
        // Non-fatal
      }

      // ── Get commit list ───────────────────────────────────────────────────
      let commits: string[];
      try {
        commits = getCommitList(opts.since, cwd);
      } catch (err) {
        const msg = err instanceof GitError ? err.message : String(err);
        console.error(chalk.red(`✖  Failed to list commits: ${msg}`));
        process.exit(1);
      }

      if (commits.length === 0) {
        console.log(chalk.dim('No commits found matching the given criteria.'));
        process.exit(0);
      }

      const maxCommits = Math.max(1, parseInt(opts.maxCommits, 10) || 500);
      const batch = commits.slice(0, maxCommits);

      if (!opts.json) {
        console.log(chalk.bold('\nEnvShield — history scan\n'));
        console.log(
          chalk.dim(
            `  Scanning ${batch.length} of ${commits.length} commit(s)` +
              (commits.length > maxCommits
                ? chalk.yellow(` (limited to ${maxCommits} — use --max-commits to increase)`)
                : '') +
              '\n',
          ),
        );
      }

      // ── Severity filter ───────────────────────────────────────────────────
      const severityOrder: Record<string, number> = {
        critical: 3,
        high: 2,
        medium: 1,
        low: 0,
      };
      const minLevel = severityOrder[opts.minSeverity] ?? 1;
      const entropyThreshold = parseFloat(opts.threshold);

      // ── Scan commits ──────────────────────────────────────────────────────
      const jsonAccumulator: JsonFinding[] = [];
      let totalFindings = 0;
      let scannedCount = 0;

      for (const sha of batch) {
        scannedCount++;

        // Progress indicator (terminal only, not in JSON mode)
        if (!opts.json && scannedCount % 50 === 0) {
          process.stderr.write(
            chalk.dim(`  … scanned ${scannedCount}/${batch.length} commits\r`),
          );
        }

        let diff: string;
        try {
          diff = getCommitDiff(sha, cwd);
        } catch {
          // Corrupted / orphaned commit — skip silently
          continue;
        }

        if (!diff.trim()) continue;

        const fileDiffs = parseDiff(diff);
        const byFile = groupByFile(fileDiffs.flatMap((f) => f.lines));
        const commitResults: ScanResult[] = [];

        for (const [filename, lines] of byFile) {
          const maxLine = Math.max(...lines.map((l) => l.lineNumber));
          const buffer = new Array<string>(maxLine).fill('');
          for (const l of lines) {
            buffer[l.lineNumber - 1] = l.content;
          }
          const pseudoContent = buffer.join('\n');

          const results = scanContent(pseudoContent, filename, {
            entropyMinLength: 20,
            entropyThreshold: opts.entropy ? entropyThreshold : 999,
            ignoreFileContent,
          });

          commitResults.push(...results);
        }

        // Filter by severity
        const filtered = commitResults.filter(
          (r) => (severityOrder[r.severity] ?? 0) >= minLevel,
        );

        if (filtered.length === 0) continue;

        totalFindings += filtered.length;

        if (opts.json) {
          jsonAccumulator.push(
            ...filtered.map((r) => toJsonFinding(r, sha)),
          );
        } else {
          const subject = getCommitSubject(sha, cwd);
          const meta = getCommitMeta(sha, cwd);
          printCommitReport(sha, subject, meta, filtered);
        }
      }

      // ── Final output ──────────────────────────────────────────────────────
      if (opts.json) {
        printJsonReport(jsonAccumulator);
      } else {
        // Clear the progress line
        process.stderr.write('                                                  \r');

        if (totalFindings === 0) {
          console.log(chalk.green(`  ✔  No secrets found in ${scannedCount} commit(s).\n`));
        } else {
          console.log(
            chalk.yellow.bold(
              `\n  ⚠  Found ${totalFindings} finding(s) across ${scannedCount} commit(s).\n`,
            ),
          );
          console.log(
            chalk.dim(
              '  These secrets are in your git history. Consider rotating them and using\n' +
                '  git-filter-repo or BFG Repo Cleaner to scrub the history.\n',
            ),
          );
        }
      }

      // scan-history is advisory — always exit 0
      process.exit(0);
    });
}
