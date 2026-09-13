'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch, useApi } from '@/lib/use-api';
import { activeChain } from '@/lib/chain';
import type { OrgResponse } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from '@/components/ui';

export interface ApprovalGroup {
  id: string;
  name: string;
  description: string | null;
  threshold: number;
  maxAmountMicros: string | null;
  allowedAssets: string[] | null;
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
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  async function requestAttach(groupId: string) {
    setAttachError(null);
    setAttaching(groupId);
    try {
      await apiFetch(`/api/groups/${groupId}/attach`, { method: 'POST' });
      await reload();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(null);
    }
  }

  const isAdmin = orgData?.me?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval groups"
        description="Each group is a rule for releasing money: who may approve, how many of them, and up to what amount. Every group is its own Privy key quorum and policy, so one treasury can carry different limits for grants, payroll, or contractors."
        action={isAdmin && !creating ? <Button onClick={() => setCreating(true)}>New group</Button> : undefined}
      />

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
      {attachError && <ErrorNote>{attachError}</ErrorNote>}

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

            <dl className="mt-4 divide-y divide-neutral-100">
              <DataRow
                label="Limit per payment"
                value={g.maxAmountMicros ? `${g.maxAmountMicros} per asset` : 'No limit'}
              />
              <DataRow
                label="Assets"
                value={g.allowedAssets ? g.allowedAssets.join(', ') : 'All'}
              />
              <DataRow label="Approvers" value={g.members.map((m) => m.name).join(', ') || '—'} />
              <DataRow
                label="Enforced by"
                value={
                  g.attachedToWallet ? (
                    <span className="text-emerald-700">Privy — signer on the treasury</span>
                  ) : (
                    <span className="text-amber-700">PayGate — attachment pending</span>
                  )
                }
              />
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
              {g.isDefault && <Badge tone="indigo">Default</Badge>}
              {g.youCanApprove && <Badge tone="green">You can approve</Badge>}
              {!g.attachedToWallet &&
                (isAdmin ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => requestAttach(g.id)}
                    disabled={attaching !== null}
                  >
                    {attaching === g.id ? 'Requesting…' : 'Attach to treasury'}
                  </Button>
                ) : (
                  <Link href="/approvals" className="text-xs text-indigo-600 hover:underline">
                    Awaiting attachment →
                  </Link>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {data && data.groups.length === 0 && !loading && (
        <Card bodyClassName="">
          <EmptyState title="No approval groups yet" />
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
  const [assets, setAssets] = useState<string[]>([]);
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
        body: {
          name,
          description,
          threshold,
          maxAmount: maxAmount || null,
          memberIds: selected,
          allowedAssets: assets,
        },
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
          <Field
            label="Limit per payment"
            hint="In whole units of whichever asset is paid. Blank for no limit."
          >
            <input
              inputMode="numeric"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="50000"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Assets this group can release" hint="None selected means all of them.">
          <div className="flex flex-wrap gap-2">
            {activeChain.tokens.map((t) => {
              const on = assets.includes(t.symbol);
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() =>
                    setAssets((prev) =>
                      on ? prev.filter((a) => a !== t.symbol) : [...prev, t.symbol],
                    )
                  }
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    on
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {t.symbol}
                </button>
              );
            })}
          </div>
        </Field>

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
