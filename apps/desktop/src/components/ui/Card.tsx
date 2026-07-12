interface CardProps {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}

/** Surface card with consistent border/background styling. */
export function Card({ children, className = '', as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      className={[
        'rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm',
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={['px-5 py-4', className].join(' ')}>{children}</div>;
}
