'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { Badge, Button, Card, ErrorNote, Skeleton, inputClass } from '@/components/ui';

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

const FILTERS = ['All', 'Awaiting approval', 'Paid', 'Failed'] as const;

const MATCHES: Record<(typeof FILTERS)[number], (r: PaymentRow) => boolean> = {
  All: () => true,
  'Awaiting approval': (r) => r.status === 'PENDING',
  Paid: (r) => r.status === 'EXECUTED',
  Failed: (r) => r.status === 'FAILED' || r.status === 'REJECTED' || r.status === 'EXPIRED',
};

export default function Payments() {
  const { data, error, loading } = useApi<{ requests: PaymentRow[] }>('/api/requests');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.requests ?? []).filter((r) => {
      if (!MATCHES[filter](r)) return false;
      if (!needle) return true;
      return [r.payeeLabel, r.memo, r.requester.name, r.payeeAddress]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [data, filter, query]);

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  filter === f
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payee, description, requester…"
            className={`${inputClass} max-w-xs`}
          />
          <span className="text-xs text-neutral-500">
            {rows.length} of {data.requests.length}
          </span>
          <Button variant="secondary" onClick={() => exportCsv(rows)} disabled={!rows.length}>
            Export CSV
          </Button>
        </div>
      )}

      {data && data.requests.length > 0 && rows.length === 0 && (
        <Card>
          <p className="py-8 text-center text-sm text-neutral-600">
            No payments match that filter.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
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
                {rows.map((r) => (
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

/** Download the visible rows as CSV — what a finance team will actually want. */
function exportCsv(rows: PaymentRow[]) {
  const header = [
    'Date', 'Payee', 'Address', 'Amount USDC', 'Description',
    'Status', 'Route', 'Approvals', 'Requested by', 'Transaction',
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      new Date(r.createdAt).toISOString(),
      r.payeeLabel,
      r.payeeAddress,
      formatUsdc(BigInt(r.amountMicros)).replace(/,/g, ''),
      r.memo,
      STATUS_LABEL[r.status] ?? r.status,
      r.route,
      r.approvals
        .filter((a) => a.kind === 'AUTHORIZED')
        .map((a) => a.name)
        .join('; '),
      r.requester.name,
      r.txHash ?? '',
    ]
      .map((v) => escape(String(v)))
      .join(','),
  );

  const url = URL.createObjectURL(
    new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `paygate-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
