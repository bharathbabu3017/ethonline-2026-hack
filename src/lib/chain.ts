/**
 * Settlement chain configuration.
 *
 * PayGate is written against this module rather than any specific chain, so
 * moving between networks is a change here and nowhere else.
 *
 * Phase 0 tested every candidate testnet against the Privy app. Arc is the only
 * one Privy refuses to broadcast on:
 *
 *   Base Sepolia      AUTHORIZED
 *   Ethereum Sepolia  AUTHORIZED
 *   Arbitrum Sepolia  AUTHORIZED
 *   Tempo Moderato    AUTHORIZED (but needs a non-standard type-118 envelope)
 *   Arc Testnet       BLOCKED — 401 "App is not authorized to transact on chain"
 *
 * Privy will still *sign* for Arc, because signing needs no RPC access to the
 * network. That is what `self-broadcast` mode is for.
 */
import { arcTestnet, baseSepolia } from 'viem/chains';
import type { Chain } from 'viem';

/**
 * How a signed payment reaches the network.
 *
 * - `privy-broadcast` — Privy signs AND sends. It fills in nonce and gas, so
 *   there is nothing to go stale between approval and execution. Preferred.
 * - `self-broadcast` — Privy signs, PayGate sends via viem. Required on chains
 *   Privy is not authorized to transact on. Costs us nonce and gas management,
 *   and makes a signed transaction perishable; see PLAN.md Phase 3.
 */
export type BroadcastMode = 'privy-broadcast' | 'self-broadcast';

/**
 * A treasury asset.
 *
 * `address` is null for the chain's native currency, which moves as `value` on
 * a plain transfer rather than as ERC-20 calldata — the two need different
 * transactions and different policy rules.
 */
export interface TokenConfig {
  symbol: string;
  name: string;
  address: `0x${string}` | null;
  decimals: number;
  /** Pays gas on this chain. Kept fully spendable, but warned about in the UI. */
  isGasToken?: boolean;
  /** Roughly one unit = one dollar, so a shared numeric limit is meaningful. */
  isStable?: boolean;
}

export interface ChainConfig {
  chain: Chain;
  /** CAIP-2 identifier Privy expects, e.g. "eip155:84532". */
  caip2: `eip155:${number}`;
  /** ERC-20 USDC on this chain. Always the 6-decimal view. */
  usdcAddress: `0x${string}`;
  /** Everything the treasury can hold and pay out. First entry is the default. */
  tokens: TokenConfig[];
  broadcastMode: BroadcastMode;
  /** The RPC method the payment intent uses. Policy rules must target the same one. */
  rpcMethod: 'eth_sendTransaction' | 'eth_signTransaction';
  explorerTxUrl: (hash: string) => string;
  /** Where to send someone to fund the treasury. */
  faucets: { label: string; url: string }[];
  /**
   * True when a single balance covers both payments and gas, as on Arc where
   * USDC is the native gas token. False when gas is a separate asset, as on
   * Base Sepolia where it is ETH — the treasury then needs funding twice.
   */
  gasIsUsdc: boolean;
}

const BASE_SEPOLIA: ChainConfig = {
  chain: baseSepolia,
  caip2: 'eip155:84532',
  // Circle's canonical testnet USDC. Verified on-chain: symbol USDC, decimals 6.
  usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  tokens: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
      isStable: true,
    },
    {
      symbol: 'EURC',
      name: 'Euro Coin',
      address: '0x808456652fdb597867f38412077A9182bf77359F',
      decimals: 6,
      isStable: true,
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0x4200000000000000000000000000000000000006',
      decimals: 18,
    },
    {
      symbol: 'ETH',
      name: 'Ether',
      address: null,
      decimals: 18,
      isGasToken: true,
    },
  ],
  broadcastMode: 'privy-broadcast',
  rpcMethod: 'eth_sendTransaction',
  explorerTxUrl: (hash) => `https://sepolia.basescan.org/tx/${hash}`,
  faucets: [
    { label: 'USDC (Circle)', url: 'https://faucet.circle.com' },
    { label: 'ETH for gas', url: 'https://www.alchemy.com/faucets/base-sepolia' },
  ],
  gasIsUsdc: false,
};

/**
 * Arc, reachable today only via self-broadcast.
 *
 * If Privy authorizes Arc for the app, change `broadcastMode` to
 * 'privy-broadcast' and `rpcMethod` to 'eth_sendTransaction' — the nonce
 * handling in the payment path then becomes dead code.
 */
const ARC_TESTNET: ChainConfig = {
  chain: arcTestnet,
  caip2: 'eip155:5042002',
  // On Arc this is the 6-decimal ERC-20 view of the same balance that pays gas.
  // The 18-decimal native view exists too; never add the two together.
  usdcAddress: '0x3600000000000000000000000000000000000000',
  // On Arc the native balance and the USDC ERC-20 are the same pool of funds
  // seen two ways, so only the 6-decimal ERC-20 view is listed. Listing both
  // would double-count the treasury.
  tokens: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x3600000000000000000000000000000000000000',
      decimals: 6,
      isStable: true,
      isGasToken: true,
    },
  ],
  broadcastMode: 'self-broadcast',
  rpcMethod: 'eth_signTransaction',
  explorerTxUrl: (hash) => `https://testnet.arcscan.app/tx/${hash}`,
  faucets: [{ label: 'USDC (Circle)', url: 'https://faucet.circle.com' }],
  gasIsUsdc: true,
};

export const CHAINS = {
  'base-sepolia': BASE_SEPOLIA,
  'arc-testnet': ARC_TESTNET,
} as const;

export type ChainKey = keyof typeof CHAINS;

const selected = (process.env.NEXT_PUBLIC_CHAIN ?? 'base-sepolia') as ChainKey;

if (!CHAINS[selected]) {
  throw new Error(
    `Unknown NEXT_PUBLIC_CHAIN "${selected}". Expected one of: ${Object.keys(CHAINS).join(', ')}`,
  );
}

/** The active chain. Import this; do not import the individual configs. */
export const activeChain: ChainConfig = CHAINS[selected];
export const activeChainKey: ChainKey = selected;

/** USDC is 6 decimals on every chain PayGate supports. */
export const USDC_DECIMALS = 6;

/** Look up a treasury asset by symbol, falling back to the chain's default. */
export function tokenBySymbol(symbol?: string | null): TokenConfig {
  const match = activeChain.tokens.find((t) => t.symbol === symbol);
  return match ?? activeChain.tokens[0];
}
