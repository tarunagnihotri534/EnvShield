interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Centred empty-state placeholder. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span className="text-3xl mb-3 block" aria-hidden="true">{icon}</span>}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-zinc-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
