import { createPublicClient, http, erc20Abi } from 'viem';
import { activeChain, type TokenConfig } from './chain';

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

/** Balance of one asset, native or ERC-20. */
export async function tokenBalance(
  address: `0x${string}`,
  token: TokenConfig,
): Promise<bigint> {
  if (token.address === null) {
    return publicClient.getBalance({ address });
  }
  return publicClient.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

export interface AssetBalance {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}` | null;
  isGasToken: boolean;
  isStable: boolean;
  balance: bigint;
}

/**
 * Balances are polled by several components at once, and each one costs a call
 * per asset. A short cache keeps that off the public RPC without making the
 * figures feel stale — the UI already refreshes every 15s.
 */
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; balances: AssetBalance[] }>();

/** Every asset the treasury can hold, fetched together. */
export async function treasuryBalances(address: `0x${string}`): Promise<AssetBalance[]> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.balances;

  const balances = await Promise.all(
    activeChain.tokens.map(async (token) => ({
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      address: token.address,
      isGasToken: token.isGasToken ?? false,
      isStable: token.isStable ?? false,
      // A throttled RPC should not blank the whole page — fall back to the last
      // known figure for that asset, or zero.
      balance: await tokenBalance(address, token).catch(
        () => hit?.balances.find((b) => b.symbol === token.symbol)?.balance ?? 0n,
      ),
    })),
  );

  cache.set(address, { at: Date.now(), balances });
  return balances;
}
