'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { Badge, Button, Card, ErrorNote, Skeleton } from '@/components/ui';

export interface PaymentRow {
  id: string;
  payeeLabel: string;
  payeeAddress: string;
  amountMicros: string;
  memo: string;
  route: 'AUTO' | 'QUORUM';
  status: string;
  txHash: string | null;
  failureReason: string | null;
  createdAt: string;
  requester: { name: string; email: string };
  invoices: { id: string; filename: string }[];
  approvals: { memberId: string; name: string; kind: string; at: string }[];
  approvalsRequired: number;
  youApproved: boolean;
}

export const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral' | 'indigo'> = {
  EXECUTED: 'green',
  PENDING: 'amber',
  PROCESSING: 'indigo',
  FAILED: 'red',
  REJECTED: 'red',
  EXPIRED: 'neutral',
};

export const STATUS_LABEL: Record<string, string> = {
  EXECUTED: 'Paid',
  PENDING: 'Awaiting approval',
  PROCESSING: 'Settling',
  FAILED: 'Failed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export default function Payments() {
  const { data, error, loading } = useApi<{ requests: PaymentRow[] }>('/api/requests');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Every request, who approved it, and where it settled.
          </p>
        </div>
        <Link href="/payments/new">
          <Button>New payment</Button>
        </Link>
      </div>

      {loading && <Skeleton className="h-64" />}
      {error && <ErrorNote>{error}</ErrorNote>}

      {data && data.requests.length === 0 && (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">No payments yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">
              Submit one with an invoice attached. Small amounts clear on your own
              signature; larger ones wait for a second approver.
            </p>
            <Link href="/payments/new">
              <Button className="mt-5">New payment</Button>
            </Link>
          </div>
        </Card>
      )}

      {data && data.requests.length > 0 && (
        <Card className="overflow-hidden">
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3 font-medium">Payee</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Approvals</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/payments/${r.id}`} className="hover:underline">
                        <span className="font-medium">{r.payeeLabel}</span>
                      </Link>
                      <span className="block font-mono text-xs text-neutral-400">
                        {r.payeeAddress.slice(0, 10)}…{r.payeeAddress.slice(-6)}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-neutral-600">
                      {r.memo}
                      {r.invoices.length > 0 && (
                        <span className="ml-2 text-xs text-neutral-400">📎</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatUsdc(BigInt(r.amountMicros))}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {r.approvals.filter((a) => a.kind === 'AUTHORIZED').length} of{' '}
                      {r.approvalsRequired}
                      {r.route === 'QUORUM' && (
                        <span className="ml-2 text-xs text-neutral-400">quorum</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
