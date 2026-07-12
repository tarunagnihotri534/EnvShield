'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ipc } from '@/lib/ipc';
import type { RepoRecord } from '../../electron/ipcTypes';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

function StatusDot({ blocked, scanned }: { blocked: boolean; scanned: boolean }) {
  if (!scanned) return <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" title="Never scanned" />;
  return blocked
    ? <span className="inline-block h-2 w-2 rounded-full bg-red-500" title="Issues found" />
    : <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Clean" />;
}

function RepoCard({ repo, onRemove }: { repo: RepoRecord; onRemove: (id: string) => void }) {
  const lastScan = repo.lastScannedAt
    ? new Date(repo.lastScannedAt).toLocaleString()
    : 'Never scanned';

  return (
    <Card as="li" className="animate-fade-in">
      <div className="flex items-center gap-4 px-5 py-4">
        <StatusDot blocked={repo.lastScanBlocked} scanned={repo.lastScannedAt !== null} />

        <div className="flex-1 min-w-0">
          <Link
            href={`/repo?id=${repo.id}`}
            className="block text-sm font-semibold text-zinc-100 hover:text-emerald-400 transition-colors truncate"
          >
            {repo.name}
          </Link>
          <p className="mt-0.5 text-xs text-zinc-500 truncate" title={repo.path}>
            {repo.path}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-zinc-500">{lastScan}</p>
          {repo.lastScannedAt && (
            <p className={`text-xs font-medium mt-0.5 ${repo.lastScanBlocked ? 'text-red-400' : 'text-emerald-400'}`}>
              {repo.lastScanBlocked
                ? `${repo.lastFindingCount} finding${repo.lastFindingCount !== 1 ? 's' : ''}`
                : 'Clean'}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(repo.id)}
          aria-label={`Remove ${repo.name}`}
          className="shrink-0 text-zinc-600 hover:text-red-400"
        >
          ✕
        </Button>
      </div>
    </Card>
  );
}

/** Home — list of protected repositories. */
export default function HomePage() {
  const [repos, setRepos]     = useState<RepoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { repos } = await ipc.listRepos();
      setRepos(repos);
    } catch {
      // Running outside Electron (e.g. `next dev`) — show empty state
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRemove(id: string) {
    await ipc.removeRepo({ id });
    setRepos((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Protected repos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Each repo is scanned on commit via git hooks.</p>
        </div>
        <Link href="/onboarding">
          <Button variant="primary" size="sm">+ Protect a repo</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner label="Loading repos…" /></div>
      ) : repos.length === 0 ? (
        <EmptyState
          icon="🛡️"
          title="No repos protected yet"
          description="Add a git repository to start monitoring it for leaked secrets."
          action={
            <Link href="/onboarding">
              <Button variant="primary">Protect a repo</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {repos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} onRemove={handleRemove} />
          ))}
        </ul>
      )}
    </div>
  );
}
