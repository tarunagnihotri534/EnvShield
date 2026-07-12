'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ipc } from '@/lib/ipc';
import type { RepoRecord, ScanHistoryEntry } from '../../../electron/ipcTypes';
import type { ScanResult } from '@envshield-core/core';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

function FindingRow({ result }: { result: ScanResult }) {
  return (
    <tr className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
      <td className="px-5 py-3">
        <SeverityBadge severity={result.severity} />
      </td>
      <td className="px-5 py-3 text-xs font-mono text-zinc-300 max-w-[220px] truncate" title={result.file}>
        {result.file}
      </td>
      <td className="px-5 py-3 text-xs text-zinc-500 text-right font-mono tabular-nums">
        {result.line}
      </td>
      <td className="px-5 py-3 text-xs text-zinc-400 font-medium">
        {result.ruleName}
      </td>
      <td className="px-5 py-3 text-xs font-mono text-zinc-400 max-w-[200px] truncate" title={result.snippet}>
        <span className="bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800/80 shadow-inner font-mono text-zinc-400">
          {result.snippet}
        </span>
      </td>
    </tr>
  );
}

function HistoryItem({
  entry,
  expanded,
  onToggle,
}: {
  entry: ScanHistoryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const date = new Date(entry.scannedAt).toLocaleString();
  const blocked = entry.blocked;

  return (
    <Card className="overflow-hidden border border-zinc-800 bg-zinc-900/30 hover:border-zinc-700/50 transition-all duration-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-zinc-800/20 transition-colors"
        aria-expanded={expanded}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${blocked ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
          style={{ boxShadow: blocked ? '0 0 8px rgba(239, 68, 68, 0.7)' : '0 0 8px rgba(16, 185, 129, 0.7)' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-200">{date}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Trigger: <span className="font-mono text-zinc-400 capitalize">{entry.trigger}</span></p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${blocked ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
          {blocked
            ? `${entry.findings.length} finding${entry.findings.length !== 1 ? 's' : ''}`
            : 'Clean'}
        </span>
        <span className={`text-zinc-500 text-xs transition-transform duration-250 ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {expanded && entry.findings.length > 0 && (
        <div className="border-t border-zinc-850 overflow-x-auto bg-zinc-950/20">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-850 bg-zinc-900/40 text-zinc-400 font-medium">
                <th className="px-5 py-2.5 text-left font-medium">Severity</th>
                <th className="px-5 py-2.5 text-left font-medium">File</th>
                <th className="px-5 py-2.5 text-right font-medium">Line</th>
                <th className="px-5 py-2.5 text-left font-medium">Rule</th>
                <th className="px-5 py-2.5 text-left font-medium">Snippet</th>
              </tr>
            </thead>
            <tbody>
              {entry.findings.map((f, i) => (
                <FindingRow key={i} result={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && entry.findings.length === 0 && (
        <div className="border-t border-zinc-855 px-5 py-4 text-xs text-zinc-500 bg-zinc-950/10">
          No findings — repository is clean.
        </div>
      )}
    </Card>
  );
}

function RepoDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const router = useRouter();

  const [repo, setRepo]         = useState<RepoRecord | null>(null);
  const [history, setHistory]   = useState<ScanHistoryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [{ repos }, { entries }] = await Promise.all([
        ipc.listRepos(),
        ipc.getHistory({ repoId: id }),
      ]);
      const found = repos.find((r) => r.id === id) ?? null;
      setRepo(found);
      setHistory(entries);
      if (entries[0]) setExpanded(entries[0].id);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function handleScan() {
    setScanning(true);
    try {
      const { entry } = await ipc.scanRepo({ repoId: id });
      setHistory((prev) => [entry, ...prev]);
      setExpanded(entry.id);
      // Refresh repo record for updated status
      const { repos } = await ipc.listRepos();
      setRepo(repos.find((r) => r.id === id) ?? null);
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading repo…" />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <EmptyState icon="❓" title="Repo not found" action={
          <Button variant="secondary" onClick={() => router.push('/')}>Back to repos</Button>
        } />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/')}
            className="group text-xs text-zinc-500 hover:text-zinc-300 mb-3 inline-flex items-center gap-1.5 transition-colors"
          >
            <span className="inline-block transition-transform group-hover:-translate-x-0.5">←</span>
            Back to dashboard
          </button>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-lg shadow-inner">
              📂
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                {repo.name}
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${repo.lastScanBlocked ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                  {repo.lastScanBlocked ? 'Shield Blocked' : 'Protected'}
                </span>
              </h1>
              <p className="text-xs text-zinc-500 mt-1 font-mono tracking-tight">{repo.path}</p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2.5 shrink-0 pt-7">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/rules?repoId=${repo.id}`)}
          >
            Rules
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={scanning}
            onClick={handleScan}
          >
            {scanning ? 'Scanning…' : 'Scan now'}
          </Button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      {repo.lastScannedAt && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="relative overflow-hidden bg-gradient-to-br from-zinc-900/60 to-zinc-950/60 border border-zinc-850">
            <CardBody className="flex flex-col justify-between h-full min-h-[90px]">
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-wide uppercase">Security Status</p>
                <p className={`text-lg font-bold mt-2 ${repo.lastScanBlocked ? 'text-red-400' : 'text-emerald-400'}`}>
                  {repo.lastScanBlocked ? 'Action Required' : 'Shield Active'}
                </p>
              </div>
              <div className="absolute top-4 right-4 text-2xl opacity-15">
                {repo.lastScanBlocked ? '🚨' : '🛡️'}
              </div>
            </CardBody>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-zinc-900/60 to-zinc-950/60 border border-zinc-850">
            <CardBody className="flex flex-col justify-between h-full min-h-[90px]">
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-wide uppercase">Exposed Secrets</p>
                <p className="text-2xl font-black text-zinc-100 mt-1">
                  {repo.lastScanBlocked ? repo.lastFindingCount : 0}
                </p>
              </div>
              <div className="absolute top-4 right-4 text-2xl opacity-15">
                🔑
              </div>
            </CardBody>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-zinc-900/60 to-zinc-950/60 border border-zinc-850">
            <CardBody className="flex flex-col justify-between h-full min-h-[90px]">
              <div>
                <p className="text-xs font-semibold text-zinc-500 tracking-wide uppercase">Last Scanned</p>
                <p className="text-[13px] text-zinc-200 mt-2.5 font-medium leading-snug">
                  {new Date(repo.lastScannedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(repo.lastScannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="absolute top-4 right-4 text-2xl opacity-15">
                ⏱️
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Scan history */}
      <Card className="border border-zinc-850">
        <CardHeader title="Scan History" description="Comprehensive log of all commit scans and on-demand scans." />
        <CardBody className="space-y-3 p-4">
          {history.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No scans yet"
              description="Click 'Scan now' to run your first scan."
            />
          ) : (
            history.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                expanded={expanded === entry.id}
                onToggle={() => setExpanded((prev) => (prev === entry.id ? null : entry.id))}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Repo detail — scan history + re-scan button. */
export default function RepoDetailPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner label="Loading repo…" /></div>}>
      <RepoDetailContent />
    </Suspense>
  );
}
