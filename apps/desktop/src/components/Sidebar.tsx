'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: '/',            label: 'Repos',       icon: '' },
  { href: '/rules',       label: 'Rules',        icon: '' },
  { href: '/onboarding',  label: 'Protect repo', icon: '' },
];

/** Left-hand navigation sidebar. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
        <svg
          className="w-5 h-5 text-emerald-500 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span className="text-sm font-bold text-zinc-100 tracking-tight font-sans">EnvShield</span>
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label }) => {
          // Active if exact match, or if pathname starts with href (for /repo)
          const isActive =
            href === '/'
              ? pathname === '/' || pathname.startsWith('/repo')
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">EnvShield v0.0.1</p>
        <p className="text-xs text-zinc-700 mt-0.5">fully offline</p>
      </div>
    </aside>
  );
}
