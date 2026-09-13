import type { PolicyCreateParams } from '@privy-io/node/resources';
import { privyApi } from './privy-server';
import { activeChain } from './chain';
import { toPolicyHex } from './money';
import { db } from './db';
import { proposeGroupAttachment } from './wallet-changes';

/**
 * Approval groups.
 *
 * A group names an approval rule — who may approve, how many of them, and up to
 * what amount. Each one is backed by a real Privy key quorum and its own policy,
 * attached to the treasury wallet as an additional signer.
 *
 * Privy evaluates only the policy of whichever signer authorizes a transaction,
 * so one shared treasury can carry genuinely different limits per group: Grants
 * might need two of the grants committee up to $50k, while Engineering needs one
 * signature under $1k.
 */

/**
 * Privy caps display names at 50 characters. Truncate rather than fail, and
 * keep the group name (the distinguishing part) over the org name.
 */
export function displayName(orgName: string, groupName: string): string {
  const full = `${orgName} — ${groupName}`;
  if (full.length <= 50) return full;
  const room = 50 - groupName.length - 3; // 3 for the separator
  return room > 3 ? `${orgName.slice(0, room)}… ${groupName}` : groupName.slice(0, 50);
}

const TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * The policy for a group: USDC only, this chain only, and at most the group's
 * cap. Privy policies are allowlists, so anything not matched here is denied.
 */
function buildGroupPolicy(
  orgName: string,
  groupName: string,
  maxAmountMicros: bigint | null,
): PolicyCreateParams {
  const conditions: PolicyCreateParams.Rule['conditions'] = [
    {
      field_source: 'ethereum_transaction',
      field: 'to',
      operator: 'eq',
      value: activeChain.usdcAddress,
    },
    {
      field_source: 'ethereum_transaction',
      field: 'chain_id',
      operator: 'eq',
      value: String(activeChain.chain.id),
    },
  ];

  if (maxAmountMicros !== null) {
    conditions.push({
      field_source: 'ethereum_calldata',
      field: 'transfer.amount',
      abi: TRANSFER_ABI,
      operator: 'lte',
      value: toPolicyHex(maxAmountMicros),
    });
  }

  return {
    version: '1.0',
    name: displayName(orgName, groupName),
    chain_type: 'ethereum',
    rules: [
      {
        name: maxAmountMicros === null ? 'Allow USDC transfers' : 'Allow USDC up to the cap',
        method: activeChain.rpcMethod,
        action: 'ALLOW',
        conditions,
      },
    ],
  };
}

export interface CreateGroupInput {
  orgId: string;
  name: string;
  description?: string;
  threshold: number;
  maxAmountMicros: bigint | null;
  memberIds: string[];
  isDefault?: boolean;
  /// Member proposing the change. Omitted during org setup, where there is no
  /// one yet to sign and the starting groups are PayGate-enforced.
  proposedById?: string;
}

export async function createApprovalGroup(input: CreateGroupInput) {
  const org = await db.org.findUnique({ where: { id: input.orgId } });
  if (!org) throw new Error('Organization not found');

  const members = await db.member.findMany({
    where: { id: { in: input.memberIds }, orgId: org.id },
  });
  if (members.length === 0) {
    throw new Error('A group needs at least one approver');
  }
  if (input.threshold > members.length) {
    throw new Error(
      `This group needs ${input.threshold} approvals but only has ${members.length} member${members.length === 1 ? '' : 's'}`,
    );
  }

  const quorum = await privyApi.keyQuorums.create({
    user_ids: members.map((m) => m.privyUserId),
    authorization_threshold: input.threshold,
    display_name: displayName(org.name, input.name),
  });

  const policy = await privyApi.policies.create(
    buildGroupPolicy(org.name, input.name, input.maxAmountMicros),
  );

  const group = await db.approvalGroup.create({
    data: {
      orgId: org.id,
      name: input.name,
      description: input.description ?? null,
      privyQuorumId: quorum.id,
      privyPolicyId: policy.id,
      attachedToWallet: false,
      threshold: input.threshold,
      maxAmountMicros: input.maxAmountMicros,
      isDefault: input.isDefault ?? false,
      members: { create: members.map((m) => ({ memberId: m.id })) },
    },
    include: { members: true },
  });

  // Attaching the group to the treasury is an owner-level action, so it is
  // proposed here and applied once enough approvers have signed it. Until then
  // the group's rules are enforced by PayGate rather than by Privy.
  if (input.proposedById) {
    await proposeGroupAttachment({
      orgId: org.id,
      groupId: group.id,
      groupName: group.name,
      createdById: input.proposedById,
    });
  }

  return group;
}

/**
 * The group a payment of this size should default to: the cheapest rule that
 * still permits the amount, so small payments do not drag in extra approvers.
 */
export async function suggestGroup(orgId: string, amountMicros: bigint) {
  const groups = await db.approvalGroup.findMany({ where: { orgId } });
  const permits = groups.filter(
    (g) => g.maxAmountMicros === null || amountMicros <= g.maxAmountMicros,
  );
  const pool = permits.length > 0 ? permits : groups;
  return (
    pool.sort((a, b) => a.threshold - b.threshold || Number(a.createdAt) - Number(b.createdAt))[0] ??
    null
  );
}
