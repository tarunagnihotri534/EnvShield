import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { scanContent } from '@envshield/core';
import type { ScanResult } from '@envshield/core';
import {
  getStagedDiff,
  getRepoRoot,
  isGitRepo,
  GitError,
} from '../utils/git.js';
import { parseDiff, groupByFile } from '../utils/diff.js';
import {
  printReport,
  printJsonReport,
  toJsonFinding,
} from '../utils/report.js';

/** Options accepted by `envshield scan`. */
interface ScanOpts {
  cwd: string;
  entropy: boolean;
  threshold: string;
  json: boolean;
  minSeverity: string;
}

/**
 * Registers the `envshield scan` command.
 *
 * Scans staged git changes (git diff --cached) for secrets.
 * Exits with code 1 when high- or critical-severity findings are present,
 * blocking the commit.
 */
export function scanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan staged git diff for secrets (used as a pre-commit hook)')
    .option('--cwd <path>', 'Git repo root to scan', process.cwd())
    .option('--entropy', 'Enable Shannon entropy analysis in addition to pattern matching', false)
    .option('--threshold <score>', 'Entropy score threshold (default: 3.5)', '3.5')
    .option('--json', 'Output findings as JSON', false)
    .option(
      '--min-severity <level>',
      'Minimum severity to report: critical|high|medium|low (default: low)',
      'low',
    )
    .action(async (opts: ScanOpts) => {
      const cwd = resolve(opts.cwd);

      if (!isGitRepo(cwd)) {
        console.error(chalk.red('✖  Not a git repository.'));
        process.exit(1);
      }

      // ── Read staged diff ─────────────────────────────────────────────────
      let diff: string;
      try {
        diff = getStagedDiff(cwd);
      } catch (err) {
        const msg = err instanceof GitError ? err.message : String(err);
        console.error(chalk.red(`✖  Failed to get staged diff: ${msg}`));
        process.exit(1);
      }

      if (!diff.trim()) {
        console.log(chalk.dim('Nothing staged. Skipping scan.'));
        process.exit(0);
      }

      // ── Parse diff → per-file added lines ────────────────────────────────
      const fileDiffs = parseDiff(diff);
      const byFile = groupByFile(fileDiffs.flatMap((f) => f.lines));

      // ── Load .envshieldignore if present ──────────────────────────────────
      let ignoreFileContent = '';
      try {
        const repoRoot = getRepoRoot(cwd);
        const ignorePath = join(repoRoot, '.envshieldignore');
        if (existsSync(ignorePath)) {
          ignoreFileContent = readFileSync(ignorePath, 'utf-8');
        }
      } catch {
        // Non-fatal — proceed without allowlist
      }

      // ── Scan each file's added lines ─────────────────────────────────────
      const entropyThreshold = parseFloat(opts.threshold);
      const allResults: ScanResult[] = [];

      for (const [filename, lines] of byFile) {
        // Reconstruct a pseudo-file from the added lines so scanContent()
        // sees proper line numbers matching the diff positions.
        // We build a sparse buffer: empty lines for positions before the first
        // added line, then the actual content at the correct line numbers.
        const maxLine = Math.max(...lines.map((l) => l.lineNumber));
        const buffer = new Array<string>(maxLine).fill('');
        for (const l of lines) {
          buffer[l.lineNumber - 1] = l.content;
        }
        const pseudoContent = buffer.join('\n');

        const results = scanContent(pseudoContent, filename, {
          entropyMinLength: 20,
          entropyThreshold: opts.entropy ? entropyThreshold : 999, // disable entropy when not requested
          ignoreFileContent,
        });

        allResults.push(...results);
      }

      // ── Filter by --min-severity ──────────────────────────────────────────
      const severityOrder: Record<string, number> = {
        critical: 3,
        high: 2,
        medium: 1,
        low: 0,
      };
      const minLevel = severityOrder[opts.minSeverity] ?? 0;
      const filtered = allResults.filter(
        (r) => (severityOrder[r.severity] ?? 0) >= minLevel,
      );

      // ── Report ────────────────────────────────────────────────────────────
      if (opts.json) {
        printJsonReport(filtered.map((r) => toJsonFinding(r)));
      } else {
        console.log(chalk.bold('\nEnvShield — staged diff scan\n'));
        const hasBlocking = printReport(filtered);

        if (hasBlocking) {
          console.log(
            chalk.red.bold(
              '  ✖  Commit blocked: high or critical severity secrets detected.\n' +
                '     Fix the issues above, or add `# envshield-ignore` to suppress intentional findings.\n',
            ),
          );
          process.exit(1);
        }
      }

      // Exit 1 for JSON mode too if there are blocking findings
      const hasBlockingFindings = filtered.some(
        (r) => r.severity === 'critical' || r.severity === 'high',
      );
      if (opts.json && hasBlockingFindings) {
        process.exit(1);
      }
    });
}
