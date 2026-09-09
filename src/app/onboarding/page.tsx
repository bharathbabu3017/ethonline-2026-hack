'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { apiFetch } from '@/lib/use-api';
import { Button, Card, ErrorNote, Field, inputClass } from '@/components/ui';

type Row = { email: string; name: string; role: 'APPROVER' | 'MEMBER' };

export default function Onboarding() {
  const router = useRouter();
  const { user, ready, authenticated } = usePrivy();
  const [name, setName] = useState('');
  const [threshold, setThreshold] = useState('500');
  const [rows, setRows] = useState<Row[]>([
    { email: '', name: '', role: 'APPROVER' },
    { email: '', name: '', role: 'MEMBER' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myEmail = user?.email?.address ?? '';
  const approverCount = 1 + rows.filter((r) => r.email.trim() && r.role === 'APPROVER').length;

  if (!ready) return null;
  if (!authenticated) {
    router.replace('/');
    return null;
  }

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/org', {
        method: 'POST',
        body: {
          name,
          threshold,
          creatorEmail: myEmail,
          creatorName: myEmail.split('@')[0],
          members: rows.filter((r) => r.email.trim()),
        },
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your organization</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This creates a shared treasury wallet and the approval rules that govern it. Both
        live in Privy, not in this app.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Card>
          <div className="space-y-5">
            <Field label="Company name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Northwind Trading"
                className={inputClass}
              />
            </Field>

            <Field
              label="Approval threshold (USDC)"
              hint="Payments at or below this clear on one signature. Above it, two approvers must sign."
            >
              <input
                required
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="Team">
          <p className="-mt-1 mb-4 text-sm text-neutral-600">
            You join as an admin ({myEmail || 'your account'}). Approvers can clear large
            payments; members can submit them and clear small ones.
          </p>

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => update(i, { email: e.target.value })}
                  placeholder="teammate@company.com"
                  className={inputClass}
                />
                <input
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Full name"
                  className={inputClass}
                />
                <select
                  value={row.role}
                  onChange={(e) => update(i, { role: e.target.value as Row['role'] })}
                  className={inputClass}
                >
                  <option value="APPROVER">Approver</option>
                  <option value="MEMBER">Member</option>
                </select>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((p) => [...p, { email: '', name: '', role: 'MEMBER' }])}
            >
              + Add teammate
            </Button>
            <span
              className={`text-xs ${approverCount >= 2 ? 'text-neutral-500' : 'text-amber-700'}`}
            >
              {approverCount} approver{approverCount === 1 ? '' : 's'} — 2 required
            </span>
          </div>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || approverCount < 2}>
            {busy ? 'Creating…' : 'Create organization'}
          </Button>
          <span className="text-xs text-neutral-500">
            {busy ? 'Setting up quorums, policy, and treasury in Privy…' : ''}
          </span>
        </div>
      </form>
    </main>
  );
}
