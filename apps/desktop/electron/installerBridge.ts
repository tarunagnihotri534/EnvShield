/**
 * Programmatic version of `envshield install` — no chalk, no process.exit,
 * no readline prompts. Returns a structured result the IPC handler can
 * forward to the renderer.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import type { InstallHooksResult } from './ipcTypes.js';

const ENVSHIELD_MARKER = '# envshield-managed';
const SHELL_SHEBANG = '#!/usr/bin/env sh\n';

const PRE_COMMIT_BODY = `${ENVSHIELD_MARKER}
npx envshield scan
`;

const PRE_PUSH_BODY = `${ENVSHIELD_MARKER}
npx envshield scan
`;

const SENSITIVE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.*.local',
  '*.pem',
  '*.key',
  'credentials.json',
];

type HookOutcome = 'created' | 'appended' | 'skipped';

function writeHook(hookPath: string, body: string): HookOutcome {
  const existing = existsSync(hookPath) ? readFileSync(hookPath, 'utf-8') : '';

  if (existing.includes(ENVSHIELD_MARKER)) return 'skipped';

  if (existing.trim().length === 0) {
    writeFileSync(hookPath, SHELL_SHEBANG + body, 'utf-8');
    chmodSync(hookPath, 0o755);
    return 'created';
  }

  const separator = '\n# ── appended by envshield ──\n';
  writeFileSync(hookPath, existing.trimEnd() + separator + body, 'utf-8');
  chmodSync(hookPath, 0o755);
  return 'appended';
}

function missingPatterns(gitignorePath: string): string[] {
  if (!existsSync(gitignorePath)) return [...SENSITIVE_PATTERNS];
  const content = readFileSync(gitignorePath, 'utf-8');
  return SENSITIVE_PATTERNS.filter((p) => !content.includes(p));
}

/**
 * Installs pre-commit and pre-push hooks into `repoPath/.git/hooks/`.
 * Optionally appends missing sensitive-file patterns to `.gitignore`.
 *
 * @param repoPath     - Absolute path to the git repository root.
 * @param addGitignore - When true, missing patterns are added to .gitignore.
 */
export function installHooks(
  repoPath: string,
  addGitignore: boolean,
): InstallHooksResult {
  const hooksDir = join(repoPath, '.git', 'hooks');
  mkdirSync(hooksDir, { recursive: true });

  const preCommit = writeHook(join(hooksDir, 'pre-commit'), PRE_COMMIT_BODY);
  const prePush   = writeHook(join(hooksDir, 'pre-push'),   PRE_PUSH_BODY);

  const gitignorePath = join(repoPath, '.gitignore');
  const missing = missingPatterns(gitignorePath);

  if (addGitignore && missing.length > 0) {
    const current = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf-8')
      : '';
    const section = '\n# EnvShield — sensitive files\n' + missing.join('\n') + '\n';
    writeFileSync(gitignorePath, current.trimEnd() + section, 'utf-8');
  }

  return { preCommit, prePush, gitignorePatterns: missing };
}
