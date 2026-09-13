'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { Badge } from './ui';

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

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/payments', label: 'Payments' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/team', label: 'Team' },
  { href: '/groups', label: 'Approval groups' },
  { href: '/audit', label: 'Activity' },
  { href: '/controls', label: 'Controls' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, authenticated, logout } = usePrivy();
  const { data, loading } = useApi<OrgResponse>(authenticated ? '/api/org' : null);

  // Send people where they can actually do something: sign in, or set up an org.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.replace('/');
    else if (!loading && data && !data.org) router.replace('/onboarding');
  }, [ready, authenticated, loading, data, router]);

  const org = data?.org;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white md:block">
        <div className="px-5 py-5">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            PayGate
          </Link>
          {org && <p className="mt-0.5 truncate text-xs text-neutral-500">{org.name}</p>}
        </div>
        <nav className="px-3 pb-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            {org ? (
              <>
                <span className="text-xs uppercase tracking-wide text-neutral-500">Treasury</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatUsdc(BigInt(org.balanceMicros))} USDC
                </span>
                <Badge tone="neutral">{org.chain.name}</Badge>
              </>
            ) : (
              <span className="text-sm text-neutral-400">Loading…</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data?.me && (
              <span className="hidden text-xs text-neutral-500 sm:inline">
                {data.me.name} · {data.me.role.toLowerCase()}
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs transition hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
