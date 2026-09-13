'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/use-api';
import { useApprovePayment } from '@/lib/use-approve';
import { Button, ErrorNote } from './ui';

/**
 * Approve or reject a pending payment.
 *
 * Approving signs the underlying transaction with the approver's own Privy key,
 * in their browser. PayGate never sees signing material — it only relays the
 * resulting signature to Privy, which checks it against the wallet's quorum and
 * policy. So a compromised backend still cannot manufacture an approval.
 */
export function ApproveActions({
  paymentId,
  alreadyApproved,
  onDone,
}: {
  paymentId: string;
  alreadyApproved: boolean;
  onDone: () => void;
}) {
  const approvePayment = useApprovePayment();
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setError(null);
    setBusy('approve');
    try {
      await approvePayment(paymentId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setError(null);
    setBusy('reject');
    try {
      await apiFetch(`/api/requests/${paymentId}/reject`, { method: 'POST' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
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
        <Button onClick={approve} disabled={busy !== null}>
          {busy === 'approve' ? 'Signing…' : 'Approve'}
        </Button>
        <Button variant="secondary" onClick={reject} disabled={busy !== null}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
