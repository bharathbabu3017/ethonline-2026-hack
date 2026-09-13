'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/use-api';
import { useApprovePayment } from '@/lib/use-approve';
import { Button, ErrorNote } from './ui';

/**
 * Approve, reject, or withdraw a pending payment.
 *
 * Approving signs the transaction with the approver's own Privy key, in their
 * browser — PayGate only relays the signature. Both approving and rejecting are
 * limited to the group that governs the payment, since turning one down carries
 * the same authority as releasing it. A requester can always withdraw their own
 * request, whichever group it landed in.
 */
export function ApproveActions({
  paymentId,
  alreadyApproved,
  canApprove,
  isRequester,
  groupName,
  onDone,
}: {
  paymentId: string;
  alreadyApproved: boolean;
  canApprove: boolean;
  isRequester: boolean;
  groupName?: string | null;
  onDone: () => void;
}) {
  const approvePayment = useApprovePayment();
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'approve' | 'reject') {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'approve') await approvePayment(paymentId);
      else await apiFetch(`/api/requests/${paymentId}/reject`, { method: 'POST' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Nothing to offer: not in the group, and not theirs to withdraw.
  if (!canApprove && !isRequester) {
    return (
      <p className="text-sm text-neutral-500">
        {groupName ? `Only members of “${groupName}” can approve this.` : 'You cannot approve this.'}
      </p>
    );
  }

  // Theirs, but someone else has to release it — so offer only a withdrawal.
  if (!canApprove && isRequester) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => act('reject')} disabled={busy !== null}>
            {busy === 'reject' ? 'Withdrawing…' : 'Withdraw request'}
          </Button>
          {groupName && (
            <span className="text-sm text-neutral-500">
              Awaiting “{groupName}”
            </span>
          )}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  if (alreadyApproved) {
    return (
      <p className="text-sm text-neutral-500">
        You have approved this. Waiting on another approver.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => act('approve')} disabled={busy !== null}>
          {busy === 'approve' ? 'Signing…' : 'Approve'}
        </Button>
        <Button variant="secondary" onClick={() => act('reject')} disabled={busy !== null}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
