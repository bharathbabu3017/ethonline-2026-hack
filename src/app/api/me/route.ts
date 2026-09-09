import { requirePrivyUser, UnauthenticatedError } from '@/lib/privy-server';
import { activeChain, activeChainKey } from '@/lib/chain';

/**
 * Proves the server half of auth works: the browser's Privy access token is
 * verified here, server-side, before anything is returned. Every API route in
 * later phases follows this shape.
 */
export async function GET(request: Request) {
  try {
    const userId = await requirePrivyUser(request);
    return Response.json({
      userId,
      verifiedOnServer: true,
      chain: {
        key: activeChainKey,
        name: activeChain.chain.name,
        chainId: activeChain.chain.id,
        broadcastMode: activeChain.broadcastMode,
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error('[api/me]', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
