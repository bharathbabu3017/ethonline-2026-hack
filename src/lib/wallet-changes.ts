import { privyApiRaw } from './privy-server';
import { db } from './db';

/**
 * Owner-level changes to the treasury wallet.
 *
 * Attaching an approval group as a signer is what makes its policy actually
 * enforced by Privy. Privy treats that as an owner action, requiring signatures
 * meeting the owner quorum's threshold — the same bar as a large payment.
 *
 * That is the right bar. Changing who may spend the treasury, and up to how
 * much, is at least as sensitive as making one payment. So a change is proposed,
 * signed by each approver in their own browser, and only applied once enough
 * signatures exist.
 */

/**
 * The complete signer list the wallet should have.
 *
 * Privy replaces `additional_signers` wholesale on update, so this always
 * rebuilds the full set — sending only the new group would silently detach
 * every other one.
 */
export async function desiredSigners(orgId: string, includeGroupId?: string) {
  const org = await db.org.findUnique({
    where: { id: orgId },
    include: { groups: true },
  });
  if (!org) throw new Error('Organization not found');

  const signers: { signer_id: string; override_policy_ids?: string[] }[] = [
    // The original Members quorum and its capped policy, created with the org.
    { signer_id: org.memberQuorumId, override_policy_ids: [org.memberPolicyId] },
  ];

  for (const group of org.groups) {
    const attached = group.attachedToWallet || group.id === includeGroupId;
    if (!attached) continue;
    signers.push({
      signer_id: group.privyQuorumId,
      override_policy_ids: group.privyPolicyId ? [group.privyPolicyId] : undefined,
    });
  }

  return signers;
}

/** Propose attaching a group to the treasury. Returns the pending change. */
export async function proposeGroupAttachment(params: {
  orgId: string;
  groupId: string;
  groupName: string;
  createdById: string;
}) {
  const signers = await desiredSigners(params.orgId, params.groupId);

  return db.walletChange.create({
    data: {
      orgId: params.orgId,
      type: 'ATTACH_GROUP',
      groupId: params.groupId,
      description: `Attach "${params.groupName}" to the treasury so Privy enforces its policy`,
      requestBody: JSON.stringify({ additional_signers: signers }),
      createdById: params.createdById,
    },
  });
}

/** The request an approver's browser signs to authorize a change. */
export function signableRequest(walletId: string, requestBody: string) {
  return {
    version: 1 as const,
    // Wallet updates are a PATCH, unlike payments which are a POST.
    method: 'PATCH' as const,
    url: `https://api.privy.io/v1/wallets/${walletId}`,
    body: JSON.parse(requestBody),
    headers: { 'privy-app-id': process.env.PRIVY_APP_ID! },
  };
}

/**
 * Apply a change that has collected enough signatures.
 *
 * Privy verifies them against the owner quorum before it will alter the wallet.
 */
export async function applyWalletChange(changeId: string) {
  const change = await db.walletChange.findUnique({
    where: { id: changeId },
    include: { org: true, approvals: true },
  });
  if (!change) throw new Error('Change not found');
  if (change.status === 'APPLIED') return change;

  const signatures = change.approvals.map((a) => a.signature);
  if (signatures.length < change.org.ownerThreshold) {
    throw new Error(
      `This change needs ${change.org.ownerThreshold} approvals and has ${signatures.length}`,
    );
  }

  try {
    await privyApiRaw(`/v1/wallets/${change.org.privyWalletId}`, {
      method: 'PATCH',
      body: JSON.parse(change.requestBody),
      headers: { 'privy-authorization-signature': signatures.join(',') },
    });

    if (change.groupId) {
      await db.approvalGroup.update({
        where: { id: change.groupId },
        data: { attachedToWallet: true },
      });
    }

    const applied = await db.walletChange.update({
      where: { id: change.id },
      data: { status: 'APPLIED', failureReason: null },
    });

    await db.auditEvent.create({
      data: {
        orgId: change.orgId,
        type: 'WALLET_UPDATED',
        payload: JSON.stringify({
          change: change.description,
          approvals: signatures.length,
        }),
      },
    });

    return applied;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const failed = await db.walletChange.update({
      where: { id: change.id },
      data: { status: 'FAILED', failureReason: readable(raw) },
    });

    await db.auditEvent.create({
      data: {
        orgId: change.orgId,
        type: 'WALLET_UPDATE_FAILED',
        payload: JSON.stringify({ change: change.description, reason: raw.slice(0, 400) }),
      },
    });

    return failed;
  }
}

function readable(raw: string): string {
  if (/Missing `privy-authorization-signature`|no signatures/i.test(raw)) {
    return 'Privy expected signatures it did not receive.';
  }
  if (/No valid authorization key/i.test(raw)) {
    return 'Privy did not recognise the approvers’ signatures for this treasury.';
  }
  return `Privy refused the change: ${raw.slice(0, 200)}`;
}
