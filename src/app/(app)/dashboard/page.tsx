'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatAmount } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import type { PaymentRow } from '../payments/page';
import type { ApprovalGroup } from '../groups/page';
import {
  Badge,
  Button,
  Card,
  CopyField,
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
  const rows = payments?.requests ?? [];

  const pending = rows.filter((r) => r.status === 'PENDING');
  const waitingOnYou = pending.filter((r) => r.youCanApprove && !r.youApproved);
  const paid = rows.filter((r) => r.status === 'EXECUTED');

  // Amounts in different assets are not addable — micro-USDC and wei are not
  // the same unit. Totals are therefore per-asset, and the headline figures are
  // counts.
  const sumFor = (list: PaymentRow[], symbol: string) =>
    list
      .filter((r) => r.assetSymbol === symbol)
      .reduce((sum, r) => sum + BigInt(r.amountMicros), 0n);

  const primary = org.balances[0]?.symbol ?? 'USDC';
  const paidPrimary = sumFor(paid, primary);
  const pendingPrimary = sumFor(pending, primary);

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Shared treasury on ${org.chain.name}, holding ${
          org.balances.length
        } assets under ${groupData?.groups.length ?? 0} approval rules.`}
        action={
          <Link href="/payments/new">
            <Button>New payment</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Available ${primary}`}
          value={formatAmount(BigInt(org.balances[0]?.balance ?? '0'), primary)}
          hint={`${org.balances.filter((b) => BigInt(b.balance) > 0n).length} of ${
            org.balances.length
          } assets funded`}
        />
        <Stat
          label="Awaiting approval"
          value={String(pending.length)}
          hint={
            pendingPrimary > 0n
              ? `${formatAmount(pendingPrimary, primary)} ${primary} queued`
              : 'Nothing queued'
          }
        />
        <Stat
          label="Waiting on you"
          value={String(waitingOnYou.length)}
          hint={waitingOnYou.length ? 'Needs your signature' : 'Nothing to approve'}
          accent={waitingOnYou.length > 0}
        />
        <Stat
          label="Paid to date"
          value={String(paid.length)}
          hint={
            paidPrimary > 0n
              ? `${formatAmount(paidPrimary, primary)} ${primary} settled`
              : 'Nothing settled yet'
          }
        />
      </div>

      {org.balances.every((b) => BigInt(b.balance) === 0n) && (
        <Card title="Fund the treasury" description="Nothing can be paid until it holds funds.">
          <CopyField value={org.walletAddress} label="Send funds to this address" />
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
                      {formatAmount(BigInt(r.amountMicros), r.assetSymbol)} {r.assetSymbol} —{' '}
                      {r.payeeLabel}
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
                      ? `Up to ${g.maxAmountMicros} per payment`
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

          <Card title="Treasury assets" bodyClassName="">
            <ul className="divide-y divide-neutral-100">
              {org.balances.map((b) => (
                <li key={b.symbol} className="flex items-baseline justify-between px-5 py-2.5">
                  <span className="text-sm">
                    {b.symbol}
                    {b.isGasToken && (
                      <span className="ml-1.5 text-xs text-neutral-400">gas</span>
                    )}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatAmount(BigInt(b.balance), b.symbol)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Treasury">
            <CopyField value={org.walletAddress} label="Address" />
            <dl className="mt-4 divide-y divide-neutral-100">
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
