'use client';

import { useState } from 'react';
import { apiFetch, useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import { Badge, Button, Card, ErrorNote, Field, Skeleton, inputClass } from '@/components/ui';

export interface ApprovalGroup {
  id: string;
  name: string;
  description: string | null;
  threshold: number;
  maxAmountMicros: string | null;
  isDefault: boolean;
  attachedToWallet: boolean;
  privyQuorumId: string;
  members: { id: string; name: string }[];
  youCanApprove: boolean;
}

export default function Groups() {
  const { data, error, loading, reload } = useApi<{ groups: ApprovalGroup[] }>('/api/groups');
  const { data: orgData } = useApi<OrgResponse>('/api/org');
  const [creating, setCreating] = useState(false);

  const isAdmin = orgData?.me?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval groups</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Each group is a rule for releasing money: who may approve, how many of them, and
            up to what amount. Every group is a separate key quorum and policy on the
            treasury, so one wallet can carry different limits for grants, payroll, or
            contractors.
          </p>
        </div>
        {isAdmin && !creating && (
          <Button onClick={() => setCreating(true)}>New group</Button>
        )}
      </div>

      {creating && orgData?.org && (
        <NewGroupForm
          members={orgData.org.members}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}

      {loading && <Skeleton className="h-64" />}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.groups ?? []).map((g) => (
          <Card
            key={g.id}
            title={g.name}
            action={
              <Badge tone={g.threshold > 1 ? 'amber' : 'neutral'}>
                {g.threshold} approval{g.threshold === 1 ? '' : 's'}
              </Badge>
            }
          >
            {g.description && (
              <p className="-mt-1 text-sm text-neutral-600">{g.description}</p>
            )}

            <dl className="mt-4 space-y-2.5 text-sm">
              <Row
                label="Limit"
                value={
                  g.maxAmountMicros
                    ? `${formatUsdc(BigInt(g.maxAmountMicros))} USDC`
                    : 'No limit'
                }
              />
              <Row label="Approvers" value={g.members.map((m) => m.name).join(', ') || '—'} />
              <Row
                label="Enforcement"
                value={
                  g.attachedToWallet ? (
                    <span className="text-emerald-700">Privy signer on the treasury</span>
                  ) : (
                    <span className="text-neutral-500">PayGate</span>
                  )
                }
              />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {g.isDefault && <Badge tone="indigo">Default</Badge>}
              {g.youCanApprove && <Badge tone="green">You can approve</Badge>}
            </div>
          </Card>
        ))}
      </div>

      {data && data.groups.length === 0 && !loading && (
        <Card>
          <p className="py-8 text-center text-sm text-neutral-600">
            No approval groups yet.
          </p>
        </Card>
      )}
    </div>
  );
}

function NewGroupForm({
  members,
  onCancel,
  onCreated,
}: {
  members: { id: string; name: string; email: string }[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState(2);
  const [maxAmount, setMaxAmount] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/groups', {
        method: 'POST',
        body: { name, description, threshold, maxAmount: maxAmount || null, memberIds: selected },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card title="New approval group">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grants"
            className={inputClass}
          />
        </Field>

        <Field label="Description" hint="Shown when someone picks this group.">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Grant disbursements, reviewed by the grants committee"
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Approvals required">
            <input
              required
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Limit (USDC)" hint="Leave blank for no limit.">
            <input
              inputMode="decimal"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="50000"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Who can approve">
          <div className="space-y-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="rounded border-neutral-300"
                />
                <span>{m.name}</span>
                <span className="text-neutral-400">{m.email}</span>
              </label>
            ))}
          </div>
        </Field>

        {threshold > selected.length && selected.length > 0 && (
          <p className="text-sm text-amber-700">
            {threshold} approvals needed but only {selected.length} selected — nothing could
            ever be released.
          </p>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || selected.length === 0 || threshold > selected.length}>
            {busy ? 'Creating…' : 'Create group'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}
