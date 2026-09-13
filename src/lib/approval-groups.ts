import type { PolicyCreateParams } from '@privy-io/node/resources';
import { privyApi } from './privy-server';
import { activeChain, tokenBySymbol, type TokenConfig } from './chain';
import { toPolicyHex } from './money';
import { parseUnits } from 'viem';
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
 * The policy for a group: one ALLOW rule per asset it may release.
 *
 * Privy evaluates only the policy of whichever signer authorizes a transaction,
 * so this is what gives a group its own spending limit. Native and ERC-20
 * transfers need different rules — a native transfer is bounded by the
 * transaction's `value`, an ERC-20 by the decoded `transfer.amount`.
 *
 * The cap is entered in whole units and converted per asset, so "10,000" means
 * 10,000 USDC and 10,000 EURC. An admin choosing to include a volatile asset in
 * a capped group is choosing that meaning for it too.
 */
function buildGroupPolicy(
  orgName: string,
  groupName: string,
  maxAmount: bigint | null,
  tokens: TokenConfig[],
): PolicyCreateParams {
  const rules: PolicyCreateParams.Rule[] = tokens.map((token) => {
    const conditions: PolicyCreateParams.Rule['conditions'] = [
      {
        field_source: 'ethereum_transaction',
        field: 'chain_id',
        operator: 'eq',
        value: String(activeChain.chain.id),
      },
    ];

    if (token.address === null) {
      // Native: the amount is the transaction value.
      if (maxAmount !== null) {
        conditions.push({
          field_source: 'ethereum_transaction',
          field: 'value',
          operator: 'lte',
          value: toPolicyHex(parseUnits(maxAmount.toString(), token.decimals)),
        });
      }
    } else {
      conditions.push({
        field_source: 'ethereum_transaction',
        field: 'to',
        operator: 'eq',
        value: token.address,
      });
      if (maxAmount !== null) {
        conditions.push({
          field_source: 'ethereum_calldata',
          field: 'transfer.amount',
          abi: TRANSFER_ABI,
          operator: 'lte',
          value: toPolicyHex(parseUnits(maxAmount.toString(), token.decimals)),
        });
      }
    }

    return {
      name: `${token.symbol}${maxAmount === null ? '' : ` up to ${maxAmount}`}`,
      method: activeChain.rpcMethod,
      action: 'ALLOW' as const,
      conditions,
    };
  });

  return {
    version: '1.0',
    name: displayName(orgName, groupName),
    chain_type: 'ethereum',
    rules,
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
  /// Symbols this group may release. Empty or omitted means every asset.
  allowedAssets?: string[];
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

  // Which assets this group may touch, and therefore which rules its policy needs.
  const permitted =
    input.allowedAssets && input.allowedAssets.length > 0
      ? activeChain.tokens.filter((t) => input.allowedAssets!.includes(t.symbol))
      : activeChain.tokens;
  if (permitted.length === 0) throw new Error('Pick at least one asset this group can release');

  const policy = await privyApi.policies.create(
    buildGroupPolicy(org.name, input.name, input.maxAmountMicros, permitted),
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
      allowedAssets:
        input.allowedAssets && input.allowedAssets.length > 0
          ? input.allowedAssets.join(',')
          : null,
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
export async function suggestGroup(orgId: string, amountMicros: bigint, assetSymbol?: string) {
  const groups = await db.approvalGroup.findMany({ where: { orgId } });
  const token = tokenBySymbol(assetSymbol);
  const permits = groups.filter((g) => {
    const allowed = g.allowedAssets?.split(',') ?? null;
    if (allowed && !allowed.includes(token.symbol)) return false;
    if (g.maxAmountMicros === null) return true;
    return amountMicros <= g.maxAmountMicros * 10n ** BigInt(token.decimals);
  });
  const pool = permits.length > 0 ? permits : groups;
  return (
    pool.sort((a, b) => a.threshold - b.threshold || Number(a.createdAt) - Number(b.createdAt))[0] ??
    null
  );
}
