'use client';

import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { useApproveChange } from '@/lib/use-approve-change';
import { Badge, Button, Card, ErrorNote } from './ui';

export interface WalletChange {
  id: string;
  type: string;
  description: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  group: { id: string; name: string; threshold: number } | null;
  approvals: { memberId: string; name: string; at: string }[];
  approvalsRequired: number;
  youApproved: boolean;
  youCanApprove: boolean;
}

/**
 * Treasury configuration changes awaiting approval.
 *
 * Attaching an approval group is an owner-level action at Privy, so it needs
 * the same number of signatures as a large payment — changing who may spend is
 * as sensitive as spending.
 */
export function TreasuryChanges() {
  const { data, reload } = useApi<{ changes: WalletChange[] }>('/api/wallet-changes');
  const approveChange = useApproveChange();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = (data?.changes ?? []).filter((c) => c.status === 'PENDING');
  const failed = (data?.changes ?? []).filter((c) => c.status === 'FAILED').slice(0, 2);

  if (pending.length === 0 && failed.length === 0) return null;

  async function approve(id: string) {
    setError(null);
    setBusy(id);
    try {
      await approveChange(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Treasury changes</h2>
        <p className="mt-0.5 text-sm text-neutral-600">
          Changing who can spend requires the same approvals as spending.
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {pending.map((c) => (
        <Card key={c.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="indigo">Treasury</Badge>
                <span className="font-medium">{c.description}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {c.approvals.length} of {c.approvalsRequired} approvals
                {c.approvals.length > 0 &&
                  ` · signed by ${c.approvals.map((a) => a.name).join(', ')}`}
              </p>
            </div>

            {c.youApproved ? (
              <p className="text-sm text-neutral-500">
                You approved. Waiting on another approver.
              </p>
            ) : c.youCanApprove ? (
              <Button onClick={() => approve(c.id)} disabled={busy !== null}>
                {busy === c.id ? 'Signing…' : 'Approve change'}
              </Button>
            ) : (
              <p className="text-sm text-neutral-500">Approvers only</p>
            )}
          </div>
        </Card>
      ))}

      {failed.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start gap-3">
            <Badge tone="red">Failed</Badge>
            <div className="min-w-0">
              <p className="text-sm">{c.description}</p>
              {c.failureReason && (
                <p className="mt-1 text-xs text-red-600">{c.failureReason}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
