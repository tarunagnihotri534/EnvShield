'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ipc } from '@/lib/ipc';
import type { InstallHooksResult } from '../../../electron/ipcTypes';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'pick' | 'options' | 'installing' | 'done' | 'error';

interface HookOutcomeProps {
  label: string;
  outcome: 'created' | 'appended' | 'skipped';
}

// ─── Small presentational components ─────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'pick',       label: 'Choose repo' },
    { id: 'options',    label: 'Options' },
    { id: 'installing', label: 'Install' },
    { id: 'done',       label: 'Done' },
  ];

  const order: Step[] = ['pick', 'options', 'installing', 'done'];
  const currentIdx = order.indexOf(current === 'error' ? 'installing' : current);

  return (
    <ol aria-label="Onboarding steps" className="flex items-center gap-0 mb-8">
      {steps.map(({ id, label }, i) => {
        const idx = order.indexOf(id);
        const done    = idx < currentIdx;
        const active  = idx === currentIdx;

        return (
          <li key={id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <span
                aria-current={active ? 'step' : undefined}
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition-colors',
                  done   ? 'bg-emerald-600 border-emerald-600 text-white' : '',
                  active ? 'bg-zinc-800 border-emerald-500 text-emerald-400' : '',
                  !done && !active ? 'bg-zinc-900 border-zinc-700 text-zinc-600' : '',
                ].join(' ')}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-xs ${active ? 'text-zinc-200' : 'text-zinc-600'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-12 mx-1 mb-5 transition-colors ${
                  done ? 'bg-emerald-600' : 'bg-zinc-800'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function HookOutcome({ label, outcome }: HookOutcomeProps) {
  const icon  = outcome === 'created'  ? '✅'
              : outcome === 'appended' ? '⚠️'
              : '–';
  const color = outcome === 'created'  ? 'text-emerald-400'
              : outcome === 'appended' ? 'text-yellow-400'
              : 'text-zinc-500';

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-base w-6 text-center" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${color}`}>{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {outcome === 'created'  && 'Hook created and made executable.'}
          {outcome === 'appended' && 'Existing hook found — EnvShield appended safely.'}
          {outcome === 'skipped'  && 'Already installed — no changes made.'}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/** Onboarding — "Protect a repo" wizard. */
export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep]               = useState<Step>('pick');
  const [repoPath, setRepoPath]       = useState('');
  const [addGitignore, setAddGitignore] = useState(true);
  const [runInitialScan, setRunInitialScan] = useState(true);
  const [result, setResult]           = useState<InstallHooksResult | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [scanStatus, setScanStatus]   = useState<'idle' | 'running' | 'done'>('idle');
  const [findingCount, setFindingCount] = useState(0);

  // ── Step 1: folder picker ──────────────────────────────────────────────────

  async function handlePickFolder() {
    try {
      const { path } = await ipc.pickFolder();
      if (path) {
        setRepoPath(path);
        setStep('options');
      }
    } catch {
      setErrorMsg('Could not open folder picker. Are you running inside Electron?');
      setStep('error');
    }
  }

  // ── Step 2 → 3: install ────────────────────────────────────────────────────

  async function handleInstall() {
    setStep('installing');
    setErrorMsg('');

    try {
      // 1. Install git hooks
      const hookResult = await ipc.installHooks({
        repoPath,
        addGitignore,
      });
      setResult(hookResult);

      // 2. Register repo in the store
      const { repo } = await ipc.addRepo({ path: repoPath });

      // 3. Optionally run an initial scan
      if (runInitialScan) {
        setScanStatus('running');
        const { entry } = await ipc.scanRepo({ repoId: repo.id });
        setFindingCount(entry.findings.length);
        setScanStatus('done');
      }

      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-100">Protect a repo</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Install git hooks and add the repository to your EnvShield dashboard.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step: pick ──────────────────────────────────────────────────────── */}
      {step === 'pick' && (
        <Card>
          <CardHeader
            title="Choose a repository"
            description="Select the root directory of a local git repository."
          />
          <CardBody className="space-y-4">
            {/* Manual path input as fallback / power-user option */}
            <div className="space-y-1">
              <label htmlFor="repo-path" className="text-xs text-zinc-400">
                Repository path
              </label>
              <div className="flex gap-2">
                <input
                  id="repo-path"
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/home/user/my-project"
                  className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-zinc-600"
                  aria-label="Repository path"
                />
                <Button variant="secondary" size="md" onClick={handlePickFolder}>
                  Browse…
                </Button>
              </div>
              <p className="text-xs text-zinc-600">
                Or click Browse to open a folder picker.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!repoPath.trim()}
                onClick={() => repoPath.trim() && setStep('options')}
              >
                Continue →
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Step: options ───────────────────────────────────────────────────── */}
      {step === 'options' && (
        <Card>
          <CardHeader
            title="Installation options"
            description={repoPath}
          />
          <CardBody className="space-y-5">
            <OptionToggle
              id="opt-gitignore"
              checked={addGitignore}
              onChange={setAddGitignore}
              title="Update .gitignore"
              description="Add common sensitive-file patterns (.env, *.pem, *.key, credentials.json) if they are missing."
            />

            <OptionToggle
              id="opt-scan"
              checked={runInitialScan}
              onChange={setRunInitialScan}
              title="Run initial scan"
              description="Scan the repository for any existing secrets immediately after installing hooks."
            />

            <div className="pt-2 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-4">
                The following git hooks will be installed into{' '}
                <code className="font-mono text-zinc-400">.git/hooks/</code>:
              </p>
              <div className="space-y-1">
                {(['pre-commit', 'pre-push'] as const).map((hook) => (
                  <div key={hook} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="text-emerald-500" aria-hidden="true">✓</span>
                    <code className="font-mono">{hook}</code>
                    <span className="text-zinc-600">— runs envshield scan before every {hook === 'pre-commit' ? 'commit' : 'push'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('pick')}>
                ← Back
              </Button>
              <Button variant="primary" onClick={handleInstall}>
                Install hooks
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Step: installing ────────────────────────────────────────────────── */}
      {step === 'installing' && (
        <Card>
          <CardBody className="space-y-4 py-8 flex flex-col items-center text-center">
            <span className="text-4xl animate-spin inline-block" aria-hidden="true" style={{ animationDuration: '1.5s' }}>⚙️</span>
            <div>
              <p className="text-sm font-medium text-zinc-200">Installing…</p>
              <p className="text-xs text-zinc-500 mt-1">
                {scanStatus === 'running'
                  ? 'Running initial scan — this may take a moment for large repos.'
                  : 'Writing hook scripts to .git/hooks/'}
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Step: done ──────────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <Card className="animate-fade-in">
          <CardHeader title="Installation complete" />
          <CardBody className="space-y-2 divide-y divide-zinc-800/60">
            {/* Hook outcomes */}
            <div className="pb-4 space-y-1">
              <HookOutcome label="pre-commit hook" outcome={result.preCommit} />
              <HookOutcome label="pre-push hook"   outcome={result.prePush} />
            </div>

            {/* .gitignore */}
            <div className="py-4">
              {result.gitignorePatterns.length > 0 ? (
                addGitignore ? (
                  <div className="flex items-start gap-3">
                    <span className="text-base w-6 text-center mt-0.5" aria-hidden="true">✅</span>
                    <div>
                      <p className="text-sm font-medium text-emerald-400">.gitignore updated</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Added: {result.gitignorePatterns.join(', ')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="text-base w-6 text-center mt-0.5" aria-hidden="true">⚠️</span>
                    <div>
                      <p className="text-sm font-medium text-yellow-400">.gitignore not updated</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Missing patterns: {result.gitignorePatterns.join(', ')}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-start gap-3">
                  <span className="text-base w-6 text-center mt-0.5" aria-hidden="true">✅</span>
                  <p className="text-sm font-medium text-emerald-400">.gitignore already covers sensitive files</p>
                </div>
              )}
            </div>

            {/* Initial scan result */}
            {runInitialScan && scanStatus === 'done' && (
              <div className="pt-4">
                <div className="flex items-start gap-3">
                  <span className="text-base w-6 text-center mt-0.5" aria-hidden="true">
                    {findingCount > 0 ? '⚠️' : '✅'}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${findingCount > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      Initial scan complete
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {findingCount > 0
                        ? `${findingCount} finding${findingCount !== 1 ? 's' : ''} detected. View them in the repo dashboard.`
                        : 'No secrets detected — repository looks clean.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardBody>

          <div className="px-5 pb-5 flex gap-3 justify-end border-t border-zinc-800 pt-4">
            <Button variant="ghost" onClick={() => router.push('/onboarding')}>
              Protect another
            </Button>
            <Button variant="primary" onClick={() => router.push('/')}>
              Go to dashboard →
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step: error ─────────────────────────────────────────────────────── */}
      {step === 'error' && (
        <Card className="border-red-900/60 animate-fade-in">
          <CardHeader title="Installation failed" />
          <CardBody className="space-y-4">
            <div className="rounded-lg bg-red-950/40 border border-red-900/60 px-4 py-3">
              <p className="text-sm font-mono text-red-400 break-all">{errorMsg}</p>
            </div>
            <p className="text-xs text-zinc-500">
              Common causes: the selected folder is not a git repository, or EnvShield
              doesn't have permission to write to <code className="font-mono">.git/hooks/</code>.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setStep('pick'); setErrorMsg(''); }}>
                ← Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ─── Option toggle helper ─────────────────────────────────────────────────────

function OptionToggle({
  id,
  checked,
  onChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 group">
      <div className="mt-0.5 shrink-0">
        <button
          id={id}
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={[
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            checked ? 'bg-emerald-600' : 'bg-zinc-700',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
              checked ? 'translate-x-4' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>
      <div className="cursor-pointer select-none" onClick={() => onChange(!checked)}>
        <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">
          {title}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
