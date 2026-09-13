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
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'withdraw'>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'approve' | 'reject' | 'withdraw') {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'approve') {
        await approvePayment(paymentId);
      } else {
        await apiFetch(`/api/requests/${paymentId}/reject`, {
          method: 'POST',
          body: { withdraw: kind === 'withdraw' },
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const withdrawButton = (
    <Button variant="ghost" onClick={() => act('withdraw')} disabled={busy !== null}>
      {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw request'}
    </Button>
  );

  // Nothing to offer: not in the group, and not theirs to withdraw.
  if (!canApprove && !isRequester) {
    return (
      <p className="text-sm text-neutral-500">
        {groupName ? `Only members of “${groupName}” can approve this.` : 'You cannot approve this.'}
      </p>
    );
  }

  // Theirs, but someone else has to release it — so only a withdrawal.
  if (!canApprove && isRequester) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {withdrawButton}
          {groupName && (
            <span className="text-sm text-neutral-500">Awaiting “{groupName}”</span>
          )}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  // In the group and already signed — but still able to pull their own request.
  if (alreadyApproved) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-500">
            You have approved this. Waiting on another approver.
          </p>
          {isRequester && withdrawButton}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act('approve')} disabled={busy !== null}>
          {busy === 'approve' ? 'Signing…' : 'Approve'}
        </Button>
        <Button variant="secondary" onClick={() => act('reject')} disabled={busy !== null}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
        {isRequester && withdrawButton}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
