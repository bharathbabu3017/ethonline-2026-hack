'use client';

import { useCallback } from 'react';
import { useAuthorizationSignature } from '@privy-io/react-auth';
import { apiFetch } from './use-api';

/**
 * Approving a treasury configuration change.
 *
 * Same shape as approving a payment: the approver's browser signs the wallet
 * update with their own Privy key, and only the signature reaches PayGate.
 * Privy checks them against the owner quorum before altering the wallet.
 */
export function useApproveChange() {
  const { generateAuthorizationSignature } = useAuthorizationSignature();

  return useCallback(
    async (changeId: string) => {
      const { signThis } = await apiFetch<{
        signThis: {
          version: 1;
          method: 'PATCH';
          url: string;
          body: unknown;
          headers: { 'privy-app-id': string };
        };
      }>(`/api/wallet-changes/${changeId}/payload`);

      const { signature } = await generateAuthorizationSignature(signThis);

      return apiFetch<{ status: string; failureReason: string | null }>(
        `/api/wallet-changes/${changeId}/approve`,
        { method: 'POST', body: { signature } },
      );
    },
    [generateAuthorizationSignature],
  );
}
