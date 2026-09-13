'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';

export interface OrgResponse {
  org: {
    id: string;
    name: string;
    walletAddress: string;
    thresholdMicros: string;
    balanceMicros: string;
    chain: {
      name: string;
      id: number;
      gasIsUsdc: boolean;
      faucets: { label: string; url: string }[];
    };
    members: { id: string; name: string; email: string; role: string; isYou: boolean }[];
  } | null;
  me?: { id: string; name: string; role: string };
}

/** Grouped so day-to-day work sits above configuration and oversight. */
const NAV: { section: string; items: { href: string; label: string }[] }[] = [
  {
    section: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/approvals', label: 'Pending approvals' },
      { href: '/payments', label: 'All payments' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { href: '/groups', label: 'Approval groups' },
      { href: '/team', label: 'Team management' },
    ],
  },
  {
    section: 'Oversight',
    items: [
      { href: '/audit', label: 'Audit activity' },
      { href: '/controls', label: 'Security controls' },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, authenticated, logout } = usePrivy();
  const { data, loading } = useApi<OrgResponse>(authenticated ? '/api/org' : null, {
    pollMs: 15000,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  // Send people where they can actually do something: sign in, or set up an org.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.replace('/');
    else if (!loading && data && !data.org) router.replace('/onboarding');
  }, [ready, authenticated, loading, data, router]);

  // What is waiting on you is the one number an approver needs at a glance.
  const { data: pending } = useApi<{ requests: { status: string; youCanApprove: boolean }[] }>(
    authenticated ? '/api/requests' : null,
    { pollMs: 15000 },
  );
  const waitingOnYou = (pending?.requests ?? []).filter(
    (r) => r.status === 'PENDING' && r.youCanApprove,
  ).length;

  const org = data?.org;
  const initials = (org?.name ?? '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-neutral-200 bg-white transition-transform md:static md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
            {initials || 'PG'}
          </div>
          <div className="min-w-0">
            <Link href="/dashboard" className="block truncate text-sm font-semibold leading-tight">
              {org?.name ?? 'PayGate'}
            </Link>
            <span className="text-xs text-neutral-500">Treasury</span>
          </div>
        </div>

        <nav className="space-y-5 px-3 pb-6">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {group.section}
              </p>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition ${
                      active
                        ? 'bg-neutral-100 font-medium text-neutral-900'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    {item.label}
                    {item.href === '/approvals' && waitingOnYou > 0 && (
                      <span className="ml-2 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                        {waitingOnYou}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {menuOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 bg-neutral-900/20 md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-neutral-200 bg-white/90 px-5 py-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 md:hidden"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            {org ? (
              <div className="flex items-baseline gap-2.5">
                <span className="text-xs uppercase tracking-wider text-neutral-500">Available</span>
                <span className="text-sm font-semibold tabular-nums text-neutral-900">
                  {formatUsdc(BigInt(org.balanceMicros))} USDC
                </span>
                <span className="hidden text-xs text-neutral-400 sm:inline">{org.chain.name}</span>
              </div>
            ) : (
              <span className="text-sm text-neutral-400">Loading…</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {data?.me && (
              <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex">
                {data.me.name}
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-neutral-600">
                  {data.me.role.toLowerCase()}
                </span>
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-7">{children}</main>
      </div>
    </div>
  );
}
