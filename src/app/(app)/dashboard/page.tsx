'use client';

import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import { Badge, Card, ErrorNote, Mono, Skeleton, Stat } from '@/components/ui';

export default function Dashboard() {
  const { data, error, loading } = useApi<OrgResponse>('/api/org', { pollMs: 15000 });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton /> <Skeleton /> <Skeleton />
        </div>
      </div>
    );
  }
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data?.org) return null;

  const { org } = data;
  const balance = BigInt(org.balanceMicros);
  const threshold = BigInt(org.thresholdMicros);
  const approvers = org.members.filter((m) => m.role !== 'MEMBER').length;
  const unfunded = balance === 0n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Shared treasury on {org.chain.name}, governed by a {approvers}-person approver quorum.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Treasury balance"
          value={`${formatUsdc(balance)} USDC`}
          hint={
            org.chain.gasIsUsdc
              ? 'USDC also pays gas on this chain'
              : 'Gas is paid separately in ETH'
          }
        />
        <Stat
          label="Auto-approve limit"
          value={`${formatUsdc(threshold)} USDC`}
          hint="Above this, a second approver must sign"
        />
        <Stat
          label="Team"
          value={String(org.members.length)}
          hint={`${approvers} can approve large payments`}
        />
      </div>

      {unfunded && (
        <Card title="Fund the treasury">
          <p className="text-sm text-neutral-600">
            The treasury is empty. Send test USDC to the address below
            {org.chain.gasIsUsdc ? '' : ', plus a little ETH to cover gas'}.
          </p>
          <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
            <Mono>{org.walletAddress}</Mono>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {org.chain.faucets.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium transition hover:bg-neutral-50"
              >
                {f.label} ↗
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card title="How approvals work here">
        <ol className="space-y-3 text-sm text-neutral-700">
          <Step n={1}>
            Anyone on the team submits a payment with an invoice attached.
          </Step>
          <Step n={2}>
            It is assigned an{' '}
            <a className="text-indigo-600 underline" href="/groups">
              approval group
            </a>{' '}
            — a rule naming who may approve, how many of them, and up to what amount.
          </Step>
          <Step n={3}>
            Each approver signs in their own browser with their own Privy key. PayGate
            never holds signing material, so it cannot approve on anyone&apos;s behalf.
          </Step>
          <Step n={4}>
            Once enough signatures exist, they go to Privy together, which checks them
            against the treasury&apos;s key quorum before moving anything. See{' '}
            <a className="text-indigo-600 underline" href="/controls">
              Controls
            </a>
            .
          </Step>
        </ol>
      </Card>

      <Card title="Treasury">
        <dl className="space-y-3 text-sm">
          <Row label="Address" value={<Mono>{org.walletAddress}</Mono>} />
          <Row
            label="Network"
            value={
              <span className="flex items-center gap-2">
                {org.chain.name} <Badge tone="neutral">chain {org.chain.id}</Badge>
              </span>
            }
          />
          <Row label="Custody" value="Privy organization wallet — no seed phrase" />
        </dl>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-600">
        {n}
      </span>
      <span>{children}</span>
    </li>
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
