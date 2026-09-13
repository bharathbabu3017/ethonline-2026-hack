'use client';

import { use } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatAmount } from '@/lib/money';
import { Badge, Card, DataRow, ErrorNote, Skeleton, Truncated } from '@/components/ui';
import { InvoiceLink } from '@/components/invoice-link';
import { ApproveActions } from '@/components/approve-actions';
import { STATUS_LABEL, STATUS_TONE, type PaymentRow } from '../page';
import { activeChain } from '@/lib/chain';

export default function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<{ requests: PaymentRow[] }>('/api/requests', { pollMs: 8000 });

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
              {formatAmount(BigInt(payment.amountMicros), payment.assetSymbol)} {payment.assetSymbol}
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
          {payment.group ? (
            <>
              Governed by <strong>{payment.group.name}</strong> —{' '}
              {payment.approvalsRequired === 1
                ? 'one signature from that group releases it.'
                : `${payment.approvalsRequired} signatures from that group are required.`}
            </>
          ) : payment.approvalsRequired > 1 ? (
            'Two approvers are required before this can be released.'
          ) : (
            'A single signature releases this payment.'
          )}
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
              canApprove={payment.youCanApprove}
              isRequester={payment.isRequester}
              groupName={payment.group?.name}
              onDone={reload}
            />
          </div>
        )}
      </Card>

      <Card title="Details">
        <dl className="divide-y divide-neutral-100">
          <DataRow label="Payee" value={payment.payeeLabel} />
          <DataRow label="Address" value={<Truncated value={payment.payeeAddress} head={16} />} />
          <DataRow label="Requested by" value={payment.requester.name} />
          <DataRow label="Submitted" value={new Date(payment.createdAt).toLocaleString()} />
          {payment.group && <DataRow label="Approval group" value={payment.group.name} />}
          {payment.txHash && (
            <DataRow
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
