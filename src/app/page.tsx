'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { apiFetch } from '@/lib/use-api';

export default function Home() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  // Signed-in users belong in the app: their org if they have one, setup if not.
  useEffect(() => {
    if (!ready || !authenticated) return;
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">PayGate</h1>
      <p className="mt-2 text-neutral-600">
        Pay contractors and vendors from a shared treasury, with approvals enforced before
        money moves.
      </p>

      <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-neutral-200/60" />
        ) : authenticated ? (
          <p className="text-sm text-neutral-500">Signing you in…</p>
        ) : (
          <>
            <h2 className="font-medium">Sign in</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Email only. Privy creates your wallet — no seed phrase, nothing to write down.
            </p>
            <button
              onClick={login}
              className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Continue with email
            </button>
          </>
        )}
      </section>

      <p className="mt-8 text-xs leading-relaxed text-neutral-400">
        Treasury custody, approval thresholds, and team permissions are enforced by Privy
        key quorums and policies.
      </p>
    </main>
  );
}
