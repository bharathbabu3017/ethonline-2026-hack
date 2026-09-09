'use client';

import { useEffect, useState } from 'react';
import { usePrivy, useWallets, getAccessToken } from '@privy-io/react-auth';
import { activeChain } from '@/lib/chain';

type MeResponse = {
  userId: string;
  verifiedOnServer: boolean;
  chain: { key: string; name: string; chainId: number; broadcastMode: string };
};

export default function Home() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  // Round-trip the access token through the server to prove both halves of
  // auth work — the browser session and server-side verification.
  useEffect(() => {
    if (!authenticated) {
      setMe(null);
      setMeError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/me', {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setMeError(body.error ?? `HTTP ${res.status}`);
        else setMe(body);
      } catch (e) {
        if (!cancelled) setMeError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  const email = user?.email?.address ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">PayGate</h1>
        <p className="mt-2 text-neutral-600">
          Treasury payouts with approval controls.
        </p>
      </header>

      {!ready ? (
        <div className="mt-10 h-32 animate-pulse rounded-xl bg-neutral-200/60" />
      ) : !authenticated ? (
        <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="font-medium">Sign in</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Email only — Privy creates a wallet for you. No seed phrase, nothing to
            write down.
          </p>
          <button
            onClick={login}
            className="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Continue with email
          </button>
        </section>
      ) : (
        <section className="mt-10 space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-medium">Signed in</h2>
                <p className="mt-1 truncate text-sm text-neutral-600">{email}</p>
              </div>
              <button
                onClick={logout}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-50"
              >
                Sign out
              </button>
            </div>

            <dl className="mt-6 space-y-3 border-t border-neutral-100 pt-5 text-sm">
              <Row label="Privy user ID" value={user?.id ?? '—'} mono />
              <Row
                label="Embedded wallet"
                value={embedded?.address ?? 'creating…'}
                mono
              />
              <Row
                label="Server verified"
                value={
                  meError
                    ? `failed — ${meError}`
                    : me?.verifiedOnServer
                      ? 'yes'
                      : 'checking…'
                }
                tone={meError ? 'error' : me?.verifiedOnServer ? 'ok' : 'muted'}
              />
            </dl>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-medium">Settlement chain</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Network" value={activeChain.chain.name} />
              <Row label="Chain ID" value={String(activeChain.chain.id)} mono />
              <Row label="USDC" value={activeChain.usdcAddress} mono />
              <Row label="Broadcast" value={activeChain.broadcastMode} mono />
            </dl>
            <p className="mt-5 border-t border-neutral-100 pt-4 text-xs leading-relaxed text-neutral-500">
              {activeChain.gasIsUsdc
                ? 'USDC is the native gas token here — one balance covers payments and gas.'
                : 'Gas is ETH on this network, so the treasury needs ETH alongside USDC.'}{' '}
              Change the chain with <code className="text-neutral-700">NEXT_PUBLIC_CHAIN</code>.
            </p>
          </div>
        </section>
      )}

      <footer className="mt-10 text-xs text-neutral-400">
        Phase 1 — auth and chain configuration. Org and treasury come next.
      </footer>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
  tone = 'default',
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'default' | 'ok' | 'error' | 'muted';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'error'
        ? 'text-red-600'
        : tone === 'muted'
          ? 'text-neutral-400'
          : 'text-neutral-900';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right ${mono ? 'font-mono text-xs' : ''} ${toneClass}`}
      >
        {value}
      </dd>
    </div>
  );
}
