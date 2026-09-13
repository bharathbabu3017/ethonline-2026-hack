'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { formatUsdc } from '@/lib/money';
import { activeChain } from '@/lib/chain';
import { Badge, Card, ErrorNote, Skeleton } from '@/components/ui';

interface AuditEvent {
  id: string;
  type: string;
  actor: string | null;
  at: string;
  payload: Record<string, unknown>;
  request: { id: string; payeeLabel: string; amountMicros: string; memo: string } | null;
}

const TONE: Record<string, 'green' | 'amber' | 'red' | 'indigo' | 'neutral'> = {
  ORG_CREATED: 'indigo',
  GROUP_CREATED: 'indigo',
  WALLET_UPDATED: 'green',
  WALLET_UPDATE_FAILED: 'red',
  WALLET_CHANGE_APPROVED: 'amber',
  REQUEST_SUBMITTED: 'neutral',
  APPROVED: 'amber',
  EXECUTED: 'green',
  FAILED: 'red',
  REJECTED: 'red',
};

const LABEL: Record<string, string> = {
  ORG_CREATED: 'Organization created',
  GROUP_CREATED: 'Approval group created',
  WALLET_UPDATED: 'Treasury updated',
  WALLET_UPDATE_FAILED: 'Treasury update failed',
  WALLET_CHANGE_APPROVED: 'Treasury change approved',
  REQUEST_SUBMITTED: 'Payment requested',
  APPROVED: 'Approved',
  EXECUTED: 'Paid',
  FAILED: 'Failed',
  REJECTED: 'Rejected',
};

export default function Audit() {
  const { data, error, loading } = useApi<{ events: AuditEvent[] }>('/api/audit');

  if (loading) return <Skeleton className="h-96" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Every request, approval and settlement, in order. Each entry records who acted
          and when — approvals are signed by the approver, so this is a record of
          signatures, not just clicks.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-neutral-600">Nothing has happened yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ol className="-m-5 divide-y divide-neutral-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-4 px-5 py-3.5">
                <Badge tone={TONE[e.type] ?? 'neutral'}>{LABEL[e.type] ?? e.type}</Badge>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-800">{describe(e)}</p>
                  {e.request && (
                    <Link
                      href={`/payments/${e.request.id}`}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      {e.request.memo} →
                    </Link>
                  )}
                  {typeof e.payload.txHash === 'string' && (
                    <a
                      href={activeChain.explorerTxUrl(e.payload.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-mono text-xs text-indigo-600 hover:underline"
                    >
                      {e.payload.txHash.slice(0, 12)}… ↗
                    </a>
                  )}
                  {typeof e.payload.reason === 'string' && (
                    <p className="mt-0.5 text-xs text-red-600">{e.payload.reason}</p>
                  )}
                </div>

                <time className="shrink-0 text-xs text-neutral-400" dateTime={e.at}>
                  {new Date(e.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function describe(e: AuditEvent): string {
  const who = e.actor ?? 'Someone';
  const amount = e.request ? `${formatUsdc(BigInt(e.request.amountMicros))} USDC` : '';
  const payee = e.request?.payeeLabel ?? '';

  switch (e.type) {
    case 'ORG_CREATED': {
      const members = e.payload.members;
      const approvers = e.payload.approvers;
      return `${who} created the organization with ${members} member${members === 1 ? '' : 's'}, ${approvers} of whom can approve large payments.`;
    }
    case 'REQUEST_SUBMITTED':
      return `${who} requested ${amount} to ${payee}${
        e.payload.route === 'QUORUM' ? ' — needs a second approver' : ''
      }${e.payload.invoice ? ', invoice attached' : ''}.`;
    case 'APPROVED':
      return `${who} approved ${amount} to ${payee}.`;
    case 'EXECUTED':
      return `${amount} paid to ${payee}${
        e.payload.approvals ? ` on ${e.payload.approvals} approval${e.payload.approvals === 1 ? '' : 's'}` : ''
      }.`;
    case 'FAILED':
      return `${amount} to ${payee} could not be paid.`;
    case 'REJECTED':
      return e.payload.withdrawn
        ? `${who} withdrew their request for ${amount} to ${payee}.`
        : `${who} rejected ${amount} to ${payee}.`;
    case 'GROUP_CREATED':
      return `${who} created the "${e.payload.name}" group — ${e.payload.threshold} approval${e.payload.threshold === 1 ? '' : 's'} from ${e.payload.members} member${e.payload.members === 1 ? '' : 's'}.`;
    case 'WALLET_CHANGE_APPROVED':
      return `${who} approved a treasury change: ${e.payload.change}.`;
    case 'WALLET_UPDATED':
      return `Treasury updated — ${e.payload.change}, on ${e.payload.approvals} approvals.`;
    case 'WALLET_UPDATE_FAILED':
      return `Treasury change failed — ${e.payload.change}.`;
    default:
      return `${who} — ${e.type}`;
  }
}
