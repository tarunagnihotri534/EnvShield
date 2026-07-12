import type { Severity } from '@envshield-core/core';

const styles: Record<Severity, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

/** Small inline severity badge. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide border',
        styles[severity],
      ].join(' ')}
    >
      {severity}
    </span>
  );
}
