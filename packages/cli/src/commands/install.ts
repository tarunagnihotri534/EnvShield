import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Command } from 'commander';
import chalk from 'chalk';
import { getGitDir, getRepoRoot, isGitRepo, GitError } from '../utils/git.js';

// ─── Hook script templates ────────────────────────────────────────────────────

const ENVSHIELD_MARKER = '# envshield-managed';

const PRE_COMMIT_SCRIPT = `\
${ENVSHIELD_MARKER}
npx envshield scan
`;

const PRE_PUSH_SCRIPT = `\
${ENVSHIELD_MARKER}
npx envshield scan
`;

const SHELL_SHEBANG = '#!/usr/bin/env sh\n';

// ─── .gitignore patterns we ensure are present ────────────────────────────────

const GITIGNORE_ENV_PATTERNS = [
  '.env',
  '.env.local',
  '.env.*.local',
  '*.pem',
  '*.key',
  'credentials.json',
].join('\n');

const GITIGNORE_SECTION = `\n# EnvShield — sensitive files\n${GITIGNORE_ENV_PATTERNS}\n`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readHook(hookPath: string): string {
  return existsSync(hookPath) ? readFileSync(hookPath, 'utf-8') : '';
}

/**
 * Installs or appends a single hook script.
 * Returns a description of what was done.
 */
function installHook(
  hookPath: string,
  hookScript: string,
  hookName: string,
): 'created' | 'appended' | 'skipped' {
  const existing = readHook(hookPath);

  if (existing.includes(ENVSHIELD_MARKER)) {
    return 'skipped'; // already installed
  }

  if (existing.trim().length === 0) {
    // Fresh install
    writeFileSync(hookPath, SHELL_SHEBANG + hookScript, 'utf-8');
    chmodSync(hookPath, 0o755);
    return 'created';
  }

  // Append to existing hook (e.g. Husky, lefthook)
  const separator = '\n# ── appended by envshield ──\n';
  writeFileSync(hookPath, existing.trimEnd() + separator + hookScript, 'utf-8');
  chmodSync(hookPath, 0o755);
  return 'appended';
}

/**
 * Prompts the user with a yes/no question.
 * Returns true for 'y'/'yes', false otherwise.
 */
async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} ${chalk.dim('(y/N)')} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

/**
 * Checks which of the recommended .gitignore patterns are missing and
 * returns them. Returns an empty array when everything is already covered.
 */
function missingGitignorePatterns(gitignorePath: string): string[] {
  const patterns = ['.env', '.env.local', '.env.*.local', '*.pem', '*.key', 'credentials.json'];
  if (!existsSync(gitignorePath)) return patterns;

  const content = readFileSync(gitignorePath, 'utf-8');
  return patterns.filter((p) => !content.includes(p));
}

// ─── Command ──────────────────────────────────────────────────────────────────

/** Options accepted by `envshield install`. */
interface InstallOpts {
  cwd: string;
  yes: boolean;
}

/**
 * Registers the `envshield install` command on the given Commander program.
 */
export function installCommand(program: Command): void {
  program
    .command('install')
    .description('Install git pre-commit and pre-push hooks into .git/hooks/')
    .option('--cwd <path>', 'Target git repo root', process.cwd())
    .option('-y, --yes', 'Skip all confirmation prompts (accept all)', false)
    .action(async (opts: InstallOpts) => {
      const cwd = resolve(opts.cwd);

      // ── Guard: must be inside a git repo ──────────────────────────────────
      if (!isGitRepo(cwd)) {
        console.error(chalk.red(`✖  Not a git repository: ${cwd}`));
        process.exit(1);
      }

      let gitDir: string;
      let repoRoot: string;
      try {
        gitDir = getGitDir(cwd);
        repoRoot = getRepoRoot(cwd);
      } catch (err) {
        const msg = err instanceof GitError ? err.message : String(err);
        console.error(chalk.red(`✖  ${msg}`));
        process.exit(1);
      }

      const hooksDir = join(gitDir, 'hooks');
      mkdirSync(hooksDir, { recursive: true });

      console.log(chalk.bold('\nEnvShield — hook installer\n'));

      // ── Install pre-commit ─────────────────────────────────────────────────
      const preCommitPath = join(hooksDir, 'pre-commit');
      const preCommitResult = installHook(preCommitPath, PRE_COMMIT_SCRIPT, 'pre-commit');
      logHookResult('pre-commit', preCommitPath, preCommitResult);

      // ── Install pre-push ───────────────────────────────────────────────────
      const prePushPath = join(hooksDir, 'pre-push');
      const prePushResult = installHook(prePushPath, PRE_PUSH_SCRIPT, 'pre-push');
      logHookResult('pre-push', prePushPath, prePushResult);

      // ── .gitignore check ───────────────────────────────────────────────────
      const gitignorePath = join(repoRoot, '.gitignore');
      const missing = missingGitignorePatterns(gitignorePath);

      if (missing.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠  Your .gitignore is missing these sensitive-file patterns:\n` +
              missing.map((p) => `     ${chalk.dim(p)}`).join('\n'),
          ),
        );

        const shouldAdd = opts.yes || (await confirm('\n  Add them to .gitignore now?'));

        if (shouldAdd) {
          const section =
            `\n# EnvShield — sensitive files\n` +
            missing.join('\n') +
            '\n';
          const current = existsSync(gitignorePath)
            ? readFileSync(gitignorePath, 'utf-8')
            : '';
          writeFileSync(gitignorePath, current.trimEnd() + section, 'utf-8');
          console.log(chalk.green(`  ✔  Added ${missing.length} pattern(s) to .gitignore`));
        } else {
          console.log(chalk.dim('  Skipped .gitignore update.'));
        }
      } else {
        console.log(chalk.green('\n  ✔  .gitignore already covers sensitive file patterns.'));
      }

      console.log(chalk.bold.green('\nDone.\n'));
    });
}

function logHookResult(
  name: string,
  path: string,
  result: 'created' | 'appended' | 'skipped',
): void {
  const short = path.replace(process.cwd(), '.').replace(/\\/g, '/');

  switch (result) {
    case 'created':
      console.log(chalk.green(`  ✔  Created  ${short}`));
      break;
    case 'appended':
      console.log(chalk.yellow(`  ⚠  Appended to existing ${name} hook: ${short}`));
      console.log(
        chalk.dim(
          `     An existing hook was found (Husky/lefthook?). EnvShield was appended safely.`,
        ),
      );
      break;
    case 'skipped':
      console.log(chalk.dim(`  –  Skipped  ${short}  (already installed)`));
      break;
  }
}
