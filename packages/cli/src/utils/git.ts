import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Thrown when a git command fails or git is not available. */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * Runs a git sub-command and returns stdout as a string.
 * Throws GitError on non-zero exit.
 *
 * @param args - git arguments, e.g. ['diff', '--cached']
 * @param cwd  - working directory (defaults to process.cwd())
 */
export function execGit(args: string[], cwd = process.cwd()): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024, // 100 MB — large repos can have big diffs
  });

  if (result.error) {
    throw new GitError(
      `Failed to spawn git: ${result.error.message}`,
      `git ${args.join(' ')}`,
      '',
    );
  }

  if (result.status !== 0) {
    throw new GitError(
      `git ${args.join(' ')} exited with status ${result.status ?? 'null'}`,
      `git ${args.join(' ')}`,
      result.stderr ?? '',
    );
  }

  return result.stdout ?? '';
}

/**
 * Returns true when the given directory is inside a git repository.
 */
export function isGitRepo(cwd = process.cwd()): boolean {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd,
    encoding: 'utf-8',
  });
  return result.status === 0;
}

/**
 * Returns the absolute path to the .git directory of the repo containing cwd.
 * Throws GitError when not inside a git repository.
 */
export function getGitDir(cwd = process.cwd()): string {
  const gitDir = execGit(['rev-parse', '--git-dir'], cwd).trim();
  // git rev-parse --git-dir can return a relative path
  return gitDir.startsWith('/') || /^[A-Za-z]:/.test(gitDir)
    ? gitDir
    : join(cwd, gitDir);
}

/**
 * Returns the root of the work-tree (the directory that contains .git).
 */
export function getRepoRoot(cwd = process.cwd()): string {
  return execGit(['rev-parse', '--show-toplevel'], cwd).trim();
}

/**
 * Returns the unified diff of all staged changes.
 * Returns an empty string when nothing is staged.
 */
export function getStagedDiff(cwd = process.cwd()): string {
  try {
    return execGit(['diff', '--cached', '--unified=3', '--no-color'], cwd);
  } catch (err) {
    // Exit status 1 with empty output just means nothing staged
    if (err instanceof GitError && err.stderr === '') return '';
    throw err;
  }
}

/**
 * Returns an ordered list of commit SHAs from newest to oldest.
 *
 * @param since - optional ref/date passed to --after (e.g. "1 year ago", "abc123")
 * @param cwd   - repo working directory
 */
export function getCommitList(since: string | undefined, cwd = process.cwd()): string[] {
  const args = ['log', '--all', '--format=%H', '--no-merges'];
  if (since) args.push(`--after=${since}`);

  const output = execGit(args, cwd).trim();
  if (output.length === 0) return [];
  return output.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Returns the unified diff introduced by a specific commit.
 */
export function getCommitDiff(sha: string, cwd = process.cwd()): string {
  return execGit(
    ['show', sha, '--unified=3', '--no-color', '--format=', '--diff-filter=AM'],
    cwd,
  );
}

/**
 * Returns a short (7-char) human-readable label for a commit SHA.
 */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Returns the one-line subject of a commit.
 */
export function getCommitSubject(sha: string, cwd = process.cwd()): string {
  try {
    return execGit(['log', '-1', '--format=%s', sha], cwd).trim();
  } catch {
    return '';
  }
}

/**
 * Returns the author and date of a commit as a short string.
 */
export function getCommitMeta(sha: string, cwd = process.cwd()): string {
  try {
    return execGit(['log', '-1', '--format=%an <%ae>  %ad', '--date=short', sha], cwd).trim();
  } catch {
    return '';
  }
}

/**
 * Checks whether a file exists inside the repo's .git/hooks directory.
 */
export function hookExists(hookName: string, cwd = process.cwd()): boolean {
  const gitDir = getGitDir(cwd);
  return existsSync(join(gitDir, 'hooks', hookName));
}
