'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { Badge, Card, ErrorNote, Skeleton } from '@/components/ui';
import { ApproveActions } from '@/components/approve-actions';
import { TreasuryChanges } from '@/components/treasury-changes';
import type { PaymentRow } from '../payments/page';

export default function Approvals() {
  const { data, error, loading, reload } = useApi<{ requests: PaymentRow[] }>('/api/requests', { pollMs: 8000 });

  const waiting = (data?.requests ?? []).filter((r) => r.status === 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Payments waiting on a signature. Approving here signs the transaction inside
          Privy — it is what releases the money.
        </p>
      </div>

      <TreasuryChanges />

      {loading && <Skeleton className="h-48" />}
      {error && <ErrorNote>{error}</ErrorNote>}

      {data && waiting.length === 0 && (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">Nothing waiting</p>
            <p className="mt-1 text-sm text-neutral-600">
              Payments needing a second approver will appear here.
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {waiting.map((r) => {
          const signed = r.approvals.filter((a) => a.kind === 'AUTHORIZED');
          return (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/payments/${r.id}`} className="font-medium hover:underline">
                      {formatUsdc(BigInt(r.amountMicros))} USDC
                    </Link>
                    {r.group && <Badge tone="neutral">{r.group.name}</Badge>}
                    {r.approvalsRequired > 1 && (
                      <Badge tone="amber">needs {r.approvalsRequired} approvers</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    to {r.payeeLabel} · {r.memo}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Requested by {r.requester.name} ·{' '}
                    {signed.length} of {r.approvalsRequired} signatures
                    {r.invoices.length > 0 && ' · invoice attached'}
                  </p>
                </div>
                <ApproveActions
                  paymentId={r.id}
                  alreadyApproved={r.youApproved}
                  canApprove={r.youCanApprove}
                  isRequester={r.isRequester}
                  groupName={r.group?.name}
                  onDone={reload}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
