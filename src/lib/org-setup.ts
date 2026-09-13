import { privy, privyApi } from './privy-server';
import type { PolicyCreateParams } from '@privy-io/node/resources';
import { activeChain } from './chain';
import { toPolicyHex } from './money';
import { db } from './db';
import { createApprovalGroup, displayName } from './approval-groups';

/**
 * Creating an organization wires up six Privy objects in a fixed order. Each
 * depends on the one before it, so this is deliberately sequential.
 *
 * The shape is the one proven end to end in scripts/spike/privy-org-primitives.ts.
 */

/** ERC-20 transfer ABI used to decode calldata inside the policy. */
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

export interface MemberInput {
  email: string;
  name: string;
  /** ADMIN and APPROVER can both clear over-threshold payments. */
  role: 'ADMIN' | 'APPROVER' | 'MEMBER';
}

export interface CreateOrgInput {
  name: string;
  thresholdMicros: bigint;
  members: MemberInput[];
  /** Privy user ID of the person creating the org; becomes the first ADMIN. */
  creatorPrivyUserId: string;
  creatorEmail: string;
  creatorName: string;
}

const isApprover = (role: MemberInput['role']) => role === 'ADMIN' || role === 'APPROVER';

/**
 * The capped policy attached to the Members quorum.
 *
 * Privy policies are allowlists — there is no default_action, so anything no
 * rule permits is denied. The three conditions together mean: this quorum may
 * only move USDC, only on our chain, and only up to the threshold.
 */
function buildCappedPolicy(orgName: string, thresholdMicros: bigint): PolicyCreateParams {
  return {
    version: '1.0' as const,
    name: displayName(orgName, 'under threshold'),
    chain_type: 'ethereum' as const,
    rules: [
      {
        name: 'Allow small USDC transfers',
        method: activeChain.rpcMethod,
        action: 'ALLOW' as const,
        conditions: [
          {
            field_source: 'ethereum_transaction' as const,
            field: 'to',
            operator: 'eq' as const,
            value: activeChain.usdcAddress,
          },
          {
            field_source: 'ethereum_transaction' as const,
            field: 'chain_id',
            operator: 'eq' as const,
            value: String(activeChain.chain.id),
          },
          {
            field_source: 'ethereum_calldata' as const,
            // Must match the ABI's declared input name below.
            field: 'transfer.amount',
            abi: TRANSFER_ABI,
            operator: 'lte' as const,
            value: toPolicyHex(thresholdMicros),
          },
        ],
      },
    ],
  };
}

export async function createOrganization(input: CreateOrgInput) {
  const { name, thresholdMicros, creatorPrivyUserId } = input;

  const creator: MemberInput = {
    email: input.creatorEmail,
    name: input.creatorName,
    role: 'ADMIN',
  };
  const invited = input.members.filter(
    (m) => m.email.toLowerCase() !== creator.email.toLowerCase(),
  );

  // 1. Privy users for everyone who isn't already one. The creator already is.
  const invitedUsers = await Promise.all(
    invited.map(async (m) => ({
      member: m,
      privyUserId: (
        await privyApi.users.create({
          linked_accounts: [{ type: 'email', address: m.email }],
        })
      ).id,
    })),
  );

  const roster = [
    { member: creator, privyUserId: creatorPrivyUserId },
    ...invitedUsers,
  ];

  const approverIds = roster.filter((r) => isApprover(r.member.role)).map((r) => r.privyUserId);
  const allIds = roster.map((r) => r.privyUserId);

  if (approverIds.length < 2) {
    throw new Error(
      'An organization needs at least two approvers, so that large payments always require a second person.',
    );
  }

  // 2. Approvers quorum — owns the treasury. Two signatures required, so a
  //    large payment always involves two people. Members sign for themselves
  //    from their browsers; no signing key is held by PayGate.
  const approverQuorum = await privyApi.keyQuorums.create({
    user_ids: approverIds,
    authorization_threshold: 2,
    display_name: displayName(name, 'Approvers'),
  });

  // 3. Members quorum — one signature, scoped by the capped policy below.
  const memberQuorum = await privyApi.keyQuorums.create({
    user_ids: allIds,
    authorization_threshold: 1,
    display_name: displayName(name, 'Members'),
  });

  // 4. The cap that makes a single signature safe.
  const policy = await privyApi.policies.create(buildCappedPolicy(name, thresholdMicros));

  // 5. The organization itself. Its default key quorum administers its wallets.
  const organization = await privyApi.organizations.create({
    display_name: name,
    default_key_quorum_id: approverQuorum.id,
  });

  // 6. The treasury. Omitting owner/owner_id makes Privy assign the org's
  //    default key quorum as owner; the Members quorum comes in as a scoped
  //    additional signer that can only act within its policy.
  const wallet = await privy.wallets().create({
    chain_type: 'ethereum',
    entity: { id: organization.id, type: 'organization' },
    additional_signers: [
      { signer_id: memberQuorum.id, override_policy_ids: [policy.id] },
    ],
  });

  const org = await db.org.create({
    data: {
      name,
      privyOrgId: organization.id,
      privyWalletId: wallet.id,
      walletAddress: wallet.address,
      approverQuorumId: approverQuorum.id,
      memberQuorumId: memberQuorum.id,
      memberPolicyId: policy.id,
      thresholdMicros,
      members: {
        create: roster.map((r) => ({
          privyUserId: r.privyUserId,
          email: r.member.email,
          name: r.member.name,
          role: r.member.role,
        })),
      },
      events: {
        create: {
          type: 'ORG_CREATED',
          actorId: creatorPrivyUserId,
          payload: JSON.stringify({
            treasury: wallet.address,
            chain: activeChain.chain.name,
            approvers: approverIds.length,
            members: allIds.length,
            thresholdMicros: thresholdMicros.toString(),
          }),
        },
      },
    },
    include: { members: true },
  });

  // Two starting rules, matching the threshold the org was set up with. Both are
  // ordinary groups, so an admin can edit them or add more (Grants, Engineering,
  // Contractors) without anything being special-cased.
  const approverMemberIds = org.members.filter((m) => m.role !== 'MEMBER').map((m) => m.id);
  const allMemberIds = org.members.map((m) => m.id);

  await createApprovalGroup({
    orgId: org.id,
    name: 'Standard payments',
    description: `Any team member can release up to ${thresholdMicros / 1_000_000n} USDC on their own signature.`,
    threshold: 1,
    maxAmountMicros: thresholdMicros,
    memberIds: allMemberIds,
    isDefault: true,
  });

  await createApprovalGroup({
    orgId: org.id,
    name: 'Large payments',
    description: 'Anything above the standard limit needs two approvers.',
    threshold: 2,
    maxAmountMicros: null,
    memberIds: approverMemberIds,
  });

  return org;
}
