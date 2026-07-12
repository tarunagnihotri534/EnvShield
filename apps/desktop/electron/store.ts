/**
 * Persistent JSON store for EnvShield desktop.
 * Data lives in app.getPath('userData')/envshield-store.json.
 *
 * Intentionally simple — no ORM, no migrations framework.
 * Schema version is stored in the file so future migrations can detect old data.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  RepoRecord,
  ScanHistoryEntry,
  CustomRule,
} from './ipcTypes.js';

const SCHEMA_VERSION = 1;

interface StoreData {
  schemaVersion: number;
  repos: RepoRecord[];
  /** Keyed by repoId. */
  history: Record<string, ScanHistoryEntry[]>;
  /** Keyed by repoId. */
  rules: Record<string, CustomRule[]>;
  /** Keyed by repoId — raw .envshieldignore text. */
  allowlists: Record<string, string>;
}

function emptyStore(): StoreData {
  return {
    schemaVersion: SCHEMA_VERSION,
    repos: [],
    history: {},
    rules: {},
    allowlists: {},
  };
}

export class Store {
  private data: StoreData;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'envshield-store.json');
    this.data = this.load();
  }

  private load(): StoreData {
    if (!existsSync(this.filePath)) return emptyStore();
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      // Merge with defaults to handle missing keys from older versions
      return { ...emptyStore(), ...parsed };
    } catch {
      return emptyStore();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // ── Repos ──────────────────────────────────────────────────────────────────

  listRepos(): RepoRecord[] {
    return [...this.data.repos];
  }

  getRepo(id: string): RepoRecord | undefined {
    return this.data.repos.find((r) => r.id === id);
  }

  addRepo(path: string, name?: string): RepoRecord {
    // Prevent duplicate paths
    const existing = this.data.repos.find((r) => r.path === path);
    if (existing) return existing;

    const repo: RepoRecord = {
      id: randomUUID(),
      path,
      name: name ?? path.split(/[/\\]/).filter(Boolean).at(-1) ?? path,
      lastScannedAt: null,
      lastScanBlocked: false,
      lastFindingCount: 0,
    };
    this.data.repos.push(repo);
    this.save();
    return repo;
  }

  removeRepo(id: string): void {
    this.data.repos = this.data.repos.filter((r) => r.id !== id);
    delete this.data.history[id];
    delete this.data.rules[id];
    delete this.data.allowlists[id];
    this.save();
  }

  updateRepo(id: string, patch: Partial<RepoRecord>): void {
    const idx = this.data.repos.findIndex((r) => r.id === id);
    if (idx === -1) return;
    this.data.repos[idx] = { ...this.data.repos[idx]!, ...patch };
    this.save();
  }

  // ── Scan history ───────────────────────────────────────────────────────────

  getHistory(repoId: string): ScanHistoryEntry[] {
    return [...(this.data.history[repoId] ?? [])];
  }

  addHistoryEntry(entry: ScanHistoryEntry): void {
    if (!this.data.history[entry.repoId]) {
      this.data.history[entry.repoId] = [];
    }
    // Newest first; keep last 200 entries per repo
    this.data.history[entry.repoId]!.unshift(entry);
    this.data.history[entry.repoId] = this.data.history[entry.repoId]!.slice(0, 200);
    this.save();
  }

  // ── Custom rules ───────────────────────────────────────────────────────────

  getRules(repoId: string): CustomRule[] {
    return [...(this.data.rules[repoId] ?? [])];
  }

  saveRules(repoId: string, rules: CustomRule[]): void {
    this.data.rules[repoId] = rules;
    this.save();
  }

  // ── Allowlist ──────────────────────────────────────────────────────────────

  getAllowlist(repoId: string): string {
    return this.data.allowlists[repoId] ?? '';
  }

  saveAllowlist(repoId: string, content: string): void {
    this.data.allowlists[repoId] = content;
    this.save();
  }
}
