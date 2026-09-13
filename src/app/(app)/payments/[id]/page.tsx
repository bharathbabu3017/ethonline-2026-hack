'use client';

import { use } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { Badge, Card, ErrorNote, Mono, Skeleton } from '@/components/ui';
import { InvoiceLink } from '@/components/invoice-link';
import { ApproveActions } from '@/components/approve-actions';
import { STATUS_LABEL, STATUS_TONE, type PaymentRow } from '../page';
import { activeChain } from '@/lib/chain';

export default function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<{ requests: PaymentRow[] }>('/api/requests');

  if (loading) return <Skeleton className="h-80" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  const payment = data?.requests.find((r) => r.id === id);
  if (!payment) return <ErrorNote>Payment not found</ErrorNote>;

  const approvals = payment.approvals.filter((a) => a.kind === 'AUTHORIZED');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/payments" className="text-sm text-neutral-500 hover:underline">
          ← Payments
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {formatUsdc(BigInt(payment.amountMicros))} USDC
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              to {payment.payeeLabel} · {payment.memo}
            </p>
          </div>
          <Badge tone={STATUS_TONE[payment.status] ?? 'neutral'}>
            {STATUS_LABEL[payment.status] ?? payment.status}
          </Badge>
        </div>
      </div>

      {payment.failureReason && <ErrorNote>{payment.failureReason}</ErrorNote>}

      <Card title="Approval">
        <p className="-mt-1 text-sm text-neutral-600">
          {payment.route === 'QUORUM'
            ? 'Above the limit, so Privy requires two approvers before it will sign.'
            : 'Within the limit, so a single signature releases it.'}
        </p>
        <p className="mt-3 text-sm font-medium">
          {approvals.length} of {payment.approvalsRequired} signatures collected
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {approvals.length === 0 && (
            <li className="text-neutral-500">No approvals yet.</li>
          )}
          {approvals.map((a) => (
            <li key={a.memberId} className="flex justify-between gap-4">
              <span>{a.name}</span>
              <span className="text-neutral-500">
                {new Date(a.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>

        {payment.status === 'PENDING' && (
          <div className="mt-5 border-t border-neutral-100 pt-4">
            <ApproveActions
              paymentId={payment.id}
              alreadyApproved={payment.youApproved}
              onDone={reload}
            />
          </div>
        )}
      </Card>

      <Card title="Details">
        <dl className="space-y-3 text-sm">
          <Row label="Payee" value={payment.payeeLabel} />
          <Row label="Address" value={<Mono>{payment.payeeAddress}</Mono>} />
          <Row label="Requested by" value={payment.requester.name} />
          <Row label="Submitted" value={new Date(payment.createdAt).toLocaleString()} />
          {payment.txHash && (
            <Row
              label="Transaction"
              value={
                <a
                  href={activeChain.explorerTxUrl(payment.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-indigo-600 hover:underline"
                >
                  {payment.txHash.slice(0, 14)}…{payment.txHash.slice(-8)} ↗
                </a>
              }
            />
          )}
        </dl>
      </Card>

      {payment.invoices.length > 0 && (
        <Card title="Invoice">
          <ul className="space-y-2 text-sm">
            {payment.invoices.map((inv) => (
              <li key={inv.id}>
                <InvoiceLink id={inv.id} filename={inv.filename} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            Served only to members of this organization.
          </p>
        </Card>
      )}
    </div>
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
