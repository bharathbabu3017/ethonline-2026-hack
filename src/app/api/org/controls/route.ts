import { requirePrivyUser, UnauthenticatedError, privyApi } from '@/lib/privy-server';
import { db } from '@/lib/db';
import { activeChain } from '@/lib/chain';

/**
 * The live Privy objects backing this org, read straight from Privy rather than
 * from our database.
 *
 * This exists so the enforcement is inspectable instead of merely claimed: the
 * quorum thresholds and the policy's amount cap shown here are the actual
 * records Privy evaluates against inside its TEE. If someone edited our
 * database to raise a threshold, this page would not change.
 */
export async function GET(request: Request) {
  try {
    const privyUserId = await requirePrivyUser(request);
    const member = await db.member.findUnique({
      where: { privyUserId },
      include: { org: true },
    });
    if (!member) return Response.json({ error: 'No organization' }, { status: 404 });
    const { org } = member;

    const [approverQuorum, memberQuorum, policy] = await Promise.all([
      privyApi.keyQuorums.get(org.approverQuorumId),
      privyApi.keyQuorums.get(org.memberQuorumId),
      privyApi.policies.get(org.memberPolicyId),
    ]);

    return Response.json({
      wallet: {
        id: org.privyWalletId,
        address: org.walletAddress,
        organizationId: org.privyOrgId,
      },
      chain: {
        name: activeChain.chain.name,
        id: activeChain.chain.id,
        caip2: activeChain.caip2,
        usdc: activeChain.usdcAddress,
        broadcastMode: activeChain.broadcastMode,
        rpcMethod: activeChain.rpcMethod,
      },
      approverQuorum,
      memberQuorum,
      policy,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error('[api/org/controls]', error);
    return Response.json({ error: 'Could not read Privy controls' }, { status: 500 });
  }
}
