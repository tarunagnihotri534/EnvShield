/**
 * Shared IPC channel names and payload types.
 * Imported by both main.ts (handlers) and preload.ts (bridge) so the
 * renderer and main process always agree on the contract.
 */

import type { ScanResult, Severity } from '@envshield-core/core';

// ─── Persisted data shapes ────────────────────────────────────────────────────

/** A git repo being protected by EnvShield. */
export interface RepoRecord {
  /** Stable UUID assigned at onboarding time. */
  id: string;
  /** Absolute path to the repo root. */
  path: string;
  /** User-facing display name (defaults to the directory name). */
  name: string;
  /** ISO timestamp of the last completed scan, or null if never scanned. */
  lastScannedAt: string | null;
  /** Whether the last scan found any high/critical findings. */
  lastScanBlocked: boolean;
  /** Total finding count from the last scan. */
  lastFindingCount: number;
}

/** One entry in a repo's scan history. */
export interface ScanHistoryEntry {
  id: string;
  repoId: string;
  /** ISO timestamp. */
  scannedAt: string;
  /** 'staged' | 'full' | 'on-demand' */
  trigger: 'staged' | 'full' | 'on-demand';
  findings: ScanResult[];
  blocked: boolean;
}

/** A custom regex rule added by the user in the Rules UI. */
export interface CustomRule {
  id: string;
  name: string;
  /** Raw regex source string (without delimiters). */
  pattern: string;
  severity: Severity;
  enabled: boolean;
}

// ─── IPC channel payloads ─────────────────────────────────────────────────────

// repos
export interface ListReposResult { repos: RepoRecord[] }
export interface AddRepoPayload  { path: string; name?: string }
export interface AddRepoResult   { repo: RepoRecord }
export interface RemoveRepoPayload { id: string }

// scan
export interface ScanRepoPayload { repoId: string; entropy?: boolean }
export interface ScanRepoResult  { entry: ScanHistoryEntry }
export interface GetHistoryPayload { repoId: string }
export interface GetHistoryResult  { entries: ScanHistoryEntry[] }

// install
export interface InstallHooksPayload { repoPath: string; addGitignore: boolean }
export interface InstallHooksResult  {
  preCommit: 'created' | 'appended' | 'skipped';
  prePush:   'created' | 'appended' | 'skipped';
  gitignorePatterns: string[];
}

// folder picker
export interface PickFolderResult { path: string | null }

// rules
export interface GetRulesPayload    { repoId: string }
export interface GetRulesResult     { rules: CustomRule[] }
export interface SaveRulesPayload   { repoId: string; rules: CustomRule[] }

// allowlist
export interface GetAllowlistPayload  { repoId: string }
export interface GetAllowlistResult   { content: string }
export interface SaveAllowlistPayload { repoId: string; content: string }

// ─── Channel name constants ───────────────────────────────────────────────────

export const IPC = {
  LIST_REPOS:      'repos:list',
  ADD_REPO:        'repos:add',
  REMOVE_REPO:     'repos:remove',
  SCAN_REPO:       'scan:repo',
  GET_HISTORY:     'scan:history',
  INSTALL_HOOKS:   'install:hooks',
  PICK_FOLDER:     'dialog:pickFolder',
  GET_RULES:       'rules:get',
  SAVE_RULES:      'rules:save',
  GET_ALLOWLIST:   'allowlist:get',
  SAVE_ALLOWLIST:  'allowlist:save',
} as const;
