/**
 * On-demand scanning bridge — calls @envshield/core directly (no child_process).
 * Used by the IPC handler for the "re-scan" button and onboarding initial scan.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scanContent } from '@envshield/core';
import type { ScanResult, ScanOptions } from '@envshield/core';
import type { ScanHistoryEntry, CustomRule } from './ipcTypes.js';

/** File extensions we scan; everything else is skipped. */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml', '.ini',
  '.env', '.sh', '.bash', '.zsh',
  '.py', '.rb', '.go', '.java', '.kt', '.cs', '.php',
  '.pem', '.key', '.cert', '.crt',
]);

/** Directory names to skip entirely. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  '.turbo', 'coverage', '.cache', 'vendor',
]);

/**
 * Recursively collects all scannable file paths under `root`.
 */
function collectFiles(root: string, maxFiles = 5_000): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry)) walk(full);
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          // Also include dotfiles like .env, .netrc by checking the basename
          const isEnvLike = entry.startsWith('.env') || entry.startsWith('.net');
          if (SCANNABLE_EXTENSIONS.has(ext) || isEnvLike) {
            results.push(full);
          }
        }
      } catch {
        // permission error or race — skip
      }
    }
  }

  walk(root);
  return results;
}

/**
 * Runs a full on-demand scan of a repository directory.
 *
 * @param repoId       - UUID of the repo in the store (for the history entry).
 * @param repoPath     - Absolute filesystem path to scan.
 * @param customRules  - User-defined custom rules from the store.
 * @param allowlist    - Raw .envshieldignore content from the store.
 * @param entropy      - Enable Shannon entropy analysis.
 */
export async function scanRepo(
  repoId: string,
  repoPath: string,
  customRules: CustomRule[],
  allowlist: string,
  entropy = false,
): Promise<ScanHistoryEntry> {
  const files = collectFiles(repoPath);
  const allFindings: ScanResult[] = [];

  const opts: ScanOptions = {
    entropyMinLength: 20,
    entropyThreshold: entropy ? 3.5 : 999,
    ignoreFileContent: allowlist,
  };

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue; // binary file or permission error
    }

    // Use relative path for reporting so findings are portable
    const relPath = relative(repoPath, filePath);
    const results = scanContent(content, relPath, opts);
    allFindings.push(...results);
  }

  const blocked = allFindings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );

  const entry: ScanHistoryEntry = {
    id: randomUUID(),
    repoId,
    scannedAt: new Date().toISOString(),
    trigger: 'on-demand',
    findings: allFindings,
    blocked,
  };

  return entry;
}
