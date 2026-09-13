'use client';

import { useCallback } from 'react';
import { useAuthorizationSignature } from '@privy-io/react-auth';
import { apiFetch } from './use-api';

/**
 * Approving a payment, signed in the approver's own browser.
 *
 * The signature is produced locally with the approver's Privy key; only the
 * signature reaches PayGate. Privy checks it against the treasury wallet's key
 * quorum, so PayGate cannot approve a payment on its own — it holds no key.
 */
export function useApprovePayment() {
  const { generateAuthorizationSignature } = useAuthorizationSignature();

  return useCallback(
    async (paymentId: string) => {
      const { signThis } = await apiFetch<{
        signThis: {
          version: 1;
          method: 'POST';
          url: string;
          body: unknown;
          headers: { 'privy-app-id': string };
        };
      }>(`/api/requests/${paymentId}/payload`);

      const { signature } = await generateAuthorizationSignature(signThis);

      return apiFetch<{ status: string; txHash: string | null; failureReason: string | null }>(
        `/api/requests/${paymentId}/approve`,
        { method: 'POST', body: { signature } },
      );
    },
    [generateAuthorizationSignature],
  );
}
