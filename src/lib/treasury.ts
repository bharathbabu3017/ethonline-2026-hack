import { createPublicClient, http, erc20Abi } from 'viem';
import { activeChain } from './chain';

/**
 * Read-only chain access. Server-side only — it is also what broadcasts
 * transactions in `self-broadcast` mode.
 */
export const publicClient = createPublicClient({
  chain: activeChain.chain,
  transport: http(process.env.CHAIN_RPC_URL || undefined),
});

/**
 * The treasury's USDC balance, always the 6-decimal ERC-20 view.
 *
 * On Arc this same pool of funds is also readable as an 18-decimal native
 * balance, because USDC is the gas token there. Never read both and add them —
 * that counts the same money twice. This function is the only balance source.
 */
export async function treasuryBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: activeChain.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}
