'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { apiFetch } from '@/lib/use-api';
import { ApprovalDemo } from '@/components/approval-demo';

export default function Landing() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  // Signed-in users belong in the app: their org if they have one, setup if not.
  useEffect(() => {
    if (!ready || !authenticated) return;
    setRedirecting(true);
    let cancelled = false;
    (async () => {
      try {
        const { org } = await apiFetch<{ org: unknown | null }>('/api/org');
        if (!cancelled) router.replace(org ? '/dashboard' : '/onboarding');
      } catch {
        if (!cancelled) router.replace('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, router]);

  const cta = redirecting ? 'Signing in…' : 'Start with email';

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
            PG
          </div>
          <span className="text-sm font-semibold tracking-tight">PayGate</span>
        </div>
        <button
          onClick={login}
          disabled={!ready || redirecting}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
        >
          Sign in
        </button>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-2 lg:pt-16">
            <div>
              <span className="rise fade inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                B2B treasury operations
              </span>

              <h1 className="rise rise-1 mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-6xl">
                Business payouts
                <br />
                with approvals
                <br />
                built in.
              </h1>

              <p className="rise rise-2 mt-6 max-w-md text-lg leading-relaxed text-neutral-600">
                Pay contractors, vendors and staff from one company treasury — with a rule for
                every payment: who approves, how many, up to how much.
              </p>

              <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={login}
                  disabled={!ready || redirecting}
                  className="rounded-lg bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-60"
                >
                  {cta}
                </button>
                <span className="text-sm text-neutral-500">No seed phrase.</span>
              </div>
            </div>

            <div className="rise rise-2 lg:pl-6">
              <ApprovalDemo />
            </div>
          </div>
        </section>

        {/* Three ideas, one line each */}
        <section className="border-y border-neutral-200 bg-neutral-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:grid-cols-3">
            <Point
              index={1}
              title="Rules per team"
              body="Payroll, grants, contractors — each with its own approvers and its own limit."
            />
            <Point
              index={2}
              title="Signed, not clicked"
              body="Approvers sign with their own keys. PayGate holds none of them."
            />
            <Point
              index={3}
              title="Every payment traceable"
              body="Invoice, approvers, timestamp, transaction. All of it, permanently."
            />
          </div>
        </section>

        {/* The structure, drawn */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="rise text-2xl font-semibold tracking-tight">One treasury, many rules</h2>
          <p className="rise rise-1 mt-2 max-w-lg text-neutral-600">
            Each rule is its own quorum and spending policy, so limits depend on who signs.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-[260px_1fr] lg:items-center">
            <div className="rise rise-2 rounded-2xl border border-neutral-900 bg-neutral-900 p-6 text-white">
              <p className="text-xs uppercase tracking-wider text-neutral-400">Treasury</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">128,400</p>
              <p className="text-sm text-neutral-400">USDC</p>
              <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] text-neutral-500">
                0x56E4…ed07
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { name: 'Payroll', who: 'HR · 2 people', rule: '1 approval', cap: 'up to 10,000' },
                { name: 'Grants', who: 'Committee · 4 people', rule: '2 approvals', cap: 'up to 50,000' },
                { name: 'Vendors', who: 'Finance · 3 people', rule: '2 approvals', cap: 'no limit' },
              ].map((g, i) => (
                <div
                  key={g.name}
                  className={`rise rise-${i + 3} rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-[0_4px_16px_rgba(16,24,40,0.06)]`}
                >
                  <p className="text-sm font-semibold">{g.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{g.who}</p>
                  <div className="mt-4 space-y-1.5 border-t border-neutral-100 pt-3 text-xs">
                    <p className="font-medium text-neutral-900">{g.rule}</p>
                    <p className="text-neutral-500">{g.cap} USDC</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privy */}
        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Built on Privy
            </p>
            <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Organization wallets', 'Keys held in secure enclaves'],
                ['Key quorums', 'm-of-n approval per rule'],
                ['Policies', 'Limits enforced per signer'],
                ['Embedded wallets', 'Email sign-in, no seed phrase'],
              ].map(([term, detail], i) => (
                <div key={term} className={`rise rise-${i + 1}`}>
                  <p className="text-sm font-medium text-neutral-900">{term}</p>
                  <p className="mt-1 text-sm text-neutral-600">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Close */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Set up your company treasury in two minutes.
          </h2>
          <button
            onClick={login}
            disabled={!ready || redirecting}
            className="mt-7 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {cta}
          </button>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-xs text-neutral-500">
          <span>PayGate — treasury payouts with approval controls</span>
          <span>USDC on Base Sepolia · testnet</span>
        </div>
      </footer>
    </div>
  );
}

function Point({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className={`rise rise-${index}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-500">
        {String(index).padStart(2, '0')}
      </div>
      <h3 className="mt-4 text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
    </div>
  );
}
