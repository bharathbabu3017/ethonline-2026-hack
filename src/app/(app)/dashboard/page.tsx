'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import type { PaymentRow } from '../payments/page';
import type { ApprovalGroup } from '../groups/page';
import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Stat,
  Truncated,
} from '@/components/ui';

export default function Dashboard() {
  const { data, error, loading } = useApi<OrgResponse>('/api/org', { pollMs: 15000 });
  const { data: payments } = useApi<{ requests: PaymentRow[] }>('/api/requests', {
    pollMs: 15000,
  });
  const { data: groupData } = useApi<{ groups: ApprovalGroup[] }>('/api/groups');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton /> <Skeleton /> <Skeleton /> <Skeleton />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data?.org) return null;

  const { org } = data;
  const balance = BigInt(org.balanceMicros);
  const rows = payments?.requests ?? [];

  const pending = rows.filter((r) => r.status === 'PENDING');
  const waitingOnYou = pending.filter((r) => r.youCanApprove && !r.youApproved);
  const paid = rows.filter((r) => r.status === 'EXECUTED');
  const paidTotal = paid.reduce((sum, r) => sum + BigInt(r.amountMicros), 0n);
  const pendingTotal = pending.reduce((sum, r) => sum + BigInt(r.amountMicros), 0n);

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Shared USDC treasury on ${org.chain.name}, governed by ${
          groupData?.groups.length ?? 0
        } approval rules.`}
        action={
          <Link href="/payments/new">
            <Button>New payment</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Available"
          value={`${formatUsdc(balance)} USDC`}
          hint={org.chain.gasIsUsdc ? 'Also covers gas' : 'Gas paid separately in ETH'}
        />
        <Stat
          label="Awaiting approval"
          value={formatUsdc(pendingTotal)}
          hint={`${pending.length} payment${pending.length === 1 ? '' : 's'} in the queue`}
        />
        <Stat
          label="Waiting on you"
          value={String(waitingOnYou.length)}
          hint={waitingOnYou.length ? 'Needs your signature' : 'Nothing to approve'}
          accent={waitingOnYou.length > 0}
        />
        <Stat
          label="Paid to date"
          value={formatUsdc(paidTotal)}
          hint={`${paid.length} settled payment${paid.length === 1 ? '' : 's'}`}
        />
      </div>

      {balance === 0n && (
        <Card title="Fund the treasury" description="Nothing can be paid until it holds USDC.">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
            <Truncated value={org.walletAddress} head={20} tail={12} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {org.chain.faucets.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  {f.label} ↗
                </Button>
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Needs your approval"
          description="Payments you are able to sign for"
          action={
            <Link
              href="/approvals"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              View all
            </Link>
          }
          bodyClassName=""
        >
          {waitingOnYou.length === 0 ? (
            <EmptyState
              title="Nothing waiting on you"
              description="Payments needing your signature will appear here."
            />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {waitingOnYou.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/payments/${r.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {formatUsdc(BigInt(r.amountMicros))} USDC — {r.payeeLabel}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {r.memo} · requested by {r.requester.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.group && <Badge tone="neutral">{r.group.name}</Badge>}
                    <Badge tone="amber">
                      {r.approvals.filter((a) => a.kind === 'AUTHORIZED').length}/
                      {r.approvalsRequired}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Approval rules" bodyClassName="">
            <ul className="divide-y divide-neutral-100">
              {(groupData?.groups ?? []).map((g) => (
                <li key={g.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{g.name}</span>
                    <Badge tone={g.threshold > 1 ? 'amber' : 'neutral'}>
                      {g.threshold} approval{g.threshold === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {g.maxAmountMicros
                      ? `Up to ${formatUsdc(BigInt(g.maxAmountMicros))} USDC`
                      : 'No limit'}{' '}
                    · {g.members.length} approver{g.members.length === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
              {(groupData?.groups.length ?? 0) === 0 && (
                <li className="px-5 py-6 text-center text-sm text-neutral-500">
                  No approval rules yet.
                </li>
              )}
            </ul>
          </Card>

          <Card title="Treasury">
            <dl className="divide-y divide-neutral-100">
              <DataRow label="Address" value={<Truncated value={org.walletAddress} />} />
              <DataRow label="Network" value={`${org.chain.name} · ${org.chain.id}`} />
              <DataRow label="Custody" value="Privy organization wallet" />
              <DataRow label="Team" value={`${org.members.length} members`} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
