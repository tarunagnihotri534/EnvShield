'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ipc } from '@/lib/ipc';
import type { CustomRule, RepoRecord } from '../../../electron/ipcTypes';
import type { Severity } from '@envshield/core';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: CustomRule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/20">
      <td className="px-4 py-3 text-xs font-medium text-zinc-200">{rule.name}</td>
      <td className="px-4 py-3 text-xs font-mono text-zinc-400 max-w-[220px] truncate" title={rule.pattern}>
        {rule.pattern}
      </td>
      <td className="px-4 py-3">
        <SeverityBadge severity={rule.severity} />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onToggle(rule.id)}
          aria-checked={rule.enabled}
          role="switch"
          className={[
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            rule.enabled ? 'bg-emerald-600' : 'bg-zinc-700',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
              rule.enabled ? 'translate-x-4' : 'translate-x-1',
            ].join(' ')}
          />
          <span className="sr-only">{rule.enabled ? 'Enabled' : 'Disabled'}</span>
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="danger" size="sm" onClick={() => onDelete(rule.id)}>
          Delete
        </Button>
      </td>
    </tr>
  );
}

interface NewRuleForm {
  name: string;
  pattern: string;
  severity: Severity;
}

/** Rules — custom pattern management + allowlist editor. */
function RulesPageContent() {
  const params = useSearchParams();
  const repoId = params.get('repoId') ?? '';

  const [repos, setRepos]         = useState<RepoRecord[]>([]);
  const [selectedId, setSelectedId] = useState(repoId);
  const [rules, setRules]         = useState<CustomRule[]>([]);
  const [allowlist, setAllowlist] = useState('');
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [patternError, setPatternError] = useState('');

  const [form, setForm] = useState<NewRuleForm>({
    name: '',
    pattern: '',
    severity: 'medium',
  });

  // Load repos list on mount
  useEffect(() => {
    ipc.listRepos().then(({ repos }) => {
      setRepos(repos);
      if (!selectedId && repos[0]) setSelectedId(repos[0].id);
    }).catch(() => {});
  }, [selectedId]);

  const loadRulesAndAllowlist = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ rules }, { content }] = await Promise.all([
        ipc.getRules({ repoId: id }),
        ipc.getAllowlist({ repoId: id }),
      ]);
      setRules(rules);
      setAllowlist(content);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRulesAndAllowlist(selectedId);
  }, [selectedId, loadRulesAndAllowlist]);

  function validatePattern(pattern: string): string {
    if (!pattern.trim()) return 'Pattern is required.';
    try {
      new RegExp(pattern);
      return '';
    } catch {
      return 'Invalid regular expression.';
    }
  }

  async function handleAddRule() {
    const err = validatePattern(form.pattern);
    if (err) { setPatternError(err); return; }
    if (!form.name.trim()) return;

    const newRule: CustomRule = {
      id: self.crypto.randomUUID(),
      name: form.name.trim(),
      pattern: form.pattern.trim(),
      severity: form.severity,
      enabled: true,
    };

    const updated = [...rules, newRule];
    setRules(updated);
    await ipc.saveRules({ repoId: selectedId, rules: updated });
    setForm({ name: '', pattern: '', severity: 'medium' });
    setPatternError('');
  }

  function handleToggle(id: string) {
    const updated = rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    setRules(updated);
    void ipc.saveRules({ repoId: selectedId, rules: updated });
  }

  async function handleDelete(id: string) {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    await ipc.saveRules({ repoId: selectedId, rules: updated });
  }

  async function handleSaveAllowlist() {
    setSaving(true);
    try {
      await ipc.saveAllowlist({ repoId: selectedId, content: allowlist });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Rules</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Custom patterns and allowlist configuration per repository.</p>
      </div>

      {/* Repo selector */}
      {repos.length > 0 && (
        <div className="flex items-center gap-3">
          <label htmlFor="repo-select" className="text-xs text-zinc-500 shrink-0">Repository:</label>
          <select
            id="repo-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedId ? (
        <EmptyState icon="📋" title="No repo selected" description="Add a repo first via the Protect flow." />
      ) : loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {/* Custom rules table */}
          <Card>
            <CardHeader
              title="Custom regex patterns"
              description="Rules applied on top of the built-in detection patterns."
            />
            <CardBody className="p-0">
              {rules.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="px-4 py-2 text-left text-zinc-500 font-medium">Name</th>
                      <th className="px-4 py-2 text-left text-zinc-500 font-medium">Pattern</th>
                      <th className="px-4 py-2 text-left text-zinc-500 font-medium">Severity</th>
                      <th className="px-4 py-2 text-left text-zinc-500 font-medium">Enabled</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  icon="➕"
                  title="No custom rules yet"
                  description="Add rules below to extend the built-in detection patterns."
                />
              )}
            </CardBody>

            {/* Add rule form */}
            <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
              <p className="text-xs font-medium text-zinc-400">Add a new rule</p>
              <div className="grid grid-cols-[1fr_1.5fr_auto_auto] gap-2 items-start">
                <input
                  type="text"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-zinc-600"
                  aria-label="Rule name"
                />
                <div className="space-y-1">
                  <input
                    type="text"
                    placeholder="Regex pattern"
                    value={form.pattern}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, pattern: e.target.value }));
                      setPatternError('');
                    }}
                    className={[
                      'w-full rounded-lg bg-zinc-800 border text-sm text-zinc-200 px-3 py-1.5 font-mono',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-zinc-600',
                      patternError ? 'border-red-500' : 'border-zinc-700',
                    ].join(' ')}
                    aria-label="Regex pattern"
                    aria-describedby={patternError ? 'pattern-error' : undefined}
                  />
                  {patternError && (
                    <p id="pattern-error" className="text-xs text-red-400">{patternError}</p>
                  )}
                </div>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))}
                  className="rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Severity"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddRule}
                  disabled={!form.name.trim() || !form.pattern.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </Card>

          {/* Allowlist editor */}
          <Card>
            <CardHeader
              title="Allowlist (.envshieldignore)"
              description="One entry per line. Supports glob patterns, rule IDs, and file:ruleId pairs."
              action={
                <Button variant="primary" size="sm" loading={saving} onClick={handleSaveAllowlist}>
                  Save
                </Button>
              }
            />
            <CardBody>
              <textarea
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={'# Suppress a specific rule globally\n' +
                  'entropy\n\n' +
                  '# Suppress all rules in test fixture files\n' +
                  'src/fixtures/**\n\n' +
                  '# Suppress a rule only in a specific file\n' +
                  'src/config.ts:aws-access-key-id'}
                className={[
                  'w-full rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-zinc-300',
                  'px-4 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500',
                  'placeholder:text-zinc-700',
                ].join(' ')}
                aria-label="Allowlist content"
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

export default function RulesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
      <RulesPageContent />
    </Suspense>
  );
}
