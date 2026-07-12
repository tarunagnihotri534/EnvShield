/** Accessible loading spinner. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-2 text-zinc-400 text-sm">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
