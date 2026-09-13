import { privyApiRaw } from './privy-server';
import { activeChain } from './chain';
import { publicClient } from './treasury';
import { db } from './db';

/**
 * Executing a payment once it has the approvals it needs.
 *
 * Each approver signs the payment request in their own browser, with their own
 * Privy key. PayGate stores those signatures and submits them together here —
 * it never holds signing material, so it cannot approve a payment by itself.
 *
 * Privy verifies the signatures against the treasury wallet's key quorum. Note
 * that its enforcement has been observed toggling on and off on this app: the
 * same wallet returned 401 for an unsigned request one hour and accepted one
 * the next. The approval count is therefore also checked here, so the rule
 * holds regardless of what Privy is doing at the time.
 */

export class NotEnoughApprovals extends Error {}

/** How many approvals a payment needs before money may move. */
export const approvalsRequired = (route: string) => (route === 'QUORUM' ? 2 : 1);

interface RpcResult {
  hash?: string;
  transaction_hash?: string;
  signed_transaction?: string;
}

/**
 * Submit the transfer to Privy and record the outcome.
 *
 * Refuses unless enough approvals are recorded — the check that currently
 * stands in for Privy's quorum enforcement.
 */
export async function settlePayment(paymentId: string) {
  const payment = await db.paymentRequest.findUnique({
    where: { id: paymentId },
    include: { org: true, approvals: true },
  });
  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'EXECUTED') return payment;

  const approved = payment.approvals.filter((a) => a.kind === 'AUTHORIZED').length;
  const required = approvalsRequired(payment.route);
  if (approved < required) {
    throw new NotEnoughApprovals(
      `This payment needs ${required} approvals and has ${approved}`,
    );
  }

  const body = {
    method: activeChain.rpcMethod,
    caip2: activeChain.caip2,
    params: { transaction: JSON.parse(payment.requestBody ?? '{}') },
  };

  // Every approver's signature, produced in their own browser with their own
  // Privy key. Privy checks them against the wallet's key quorum; several go
  // in one comma-delimited header.
  const signatures = payment.approvals
    .filter((a) => a.kind === 'AUTHORIZED' && a.signature)
    .map((a) => a.signature as string);

  try {
    const response = await privyApiRaw<{ data?: RpcResult } & RpcResult>(
      `/v1/wallets/${payment.org.privyWalletId}/rpc`,
      {
        method: 'POST',
        body,
        headers: signatures.length
          ? { 'privy-authorization-signature': signatures.join(',') }
          : undefined,
      },
    );
    const result = response.data ?? response;

    let txHash = result.hash ?? result.transaction_hash ?? null;

    // self-broadcast chains hand back a signed transaction to put on the
    // network ourselves; privy-broadcast chains return the hash directly.
    if (!txHash && result.signed_transaction) {
      txHash = await publicClient.sendRawTransaction({
        serializedTransaction: result.signed_transaction as `0x${string}`,
      });
    }

    const updated = await db.paymentRequest.update({
      where: { id: payment.id },
      data: { status: 'EXECUTED', txHash, failureReason: null },
    });

    await db.auditEvent.create({
      data: {
        orgId: payment.orgId,
        requestId: payment.id,
        type: 'EXECUTED',
        payload: JSON.stringify({ txHash, approvals: approved }),
      },
    });

    return updated;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const reason = readableFailure(raw);

    const updated = await db.paymentRequest.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: reason },
    });

    await db.auditEvent.create({
      data: {
        orgId: payment.orgId,
        requestId: payment.id,
        type: 'FAILED',
        payload: JSON.stringify({ reason: raw.slice(0, 500) }),
      },
    });

    return updated;
  }
}

/** Turn Privy's raw error text into something a finance person can act on. */
function readableFailure(raw: string): string {
  if (/exceeds balance|insufficient funds/i.test(raw)) {
    return 'The treasury does not hold enough USDC to cover this payment.';
  }
  if (/gas/i.test(raw) && /insufficient/i.test(raw)) {
    return 'The treasury has no gas. Top it up and resubmit.';
  }
  if (/polic/i.test(raw)) {
    return 'A spending policy refused this payment.';
  }
  if (/authorization key|Missing .privy-authorization/i.test(raw)) {
    return 'Privy rejected the signature. The app authorization key may not be registered in this treasury\'s quorum — orgs created before it was added need recreating.';
  }
  return `Privy could not execute this payment: ${raw.slice(0, 200)}`;
}
