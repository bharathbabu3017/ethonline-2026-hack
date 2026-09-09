/**
 * Shared helpers for the Phase 0 spikes.
 *
 * These scripts exist to answer two questions before any product code is written:
 *   1. Will Privy sign and broadcast a transaction on Arc? (arc-transfer.ts)
 *   2. Are Organizations / key quorums / policies enabled on this app?
 *      (privy-org-primitives.ts)
 *
 * They are throwaway. Nothing here should be imported by the app.
 */
import { PrivyClient } from '@privy-io/node';
import type {
  KeyQuorum,
  KeyQuorumCreateParams,
  Organization,
  OrganizationCreateParams,
  Policy,
  PolicyCreateParams,
  User,
  UserCreateParams,
} from '@privy-io/node/resources';
import { createPublicClient, http, erc20Abi, formatUnits } from 'viem';
import { arcTestnet } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Load .env.local. Node >=20.12 exposes loadEnvFile; the catch keeps the script
// usable when the vars are already exported in the shell instead.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* fall back to the ambient environment */
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const APP_ID = required('PRIVY_APP_ID');
export const APP_SECRET = required('PRIVY_APP_SECRET');

export const privy = new PrivyClient({ appId: APP_ID, appSecret: APP_SECRET });

/**
 * The low-level resource client, reached through a private field.
 *
 * The public `PrivyClient` surface in @privy-io/node@0.34 is missing several
 * methods the docs show: users.create, keyQuorums.create, every organizations
 * method, and intents.get/list/reject. They exist only on the underlying
 * resource client, which the SDK marks private.
 *
 * The cast is deliberate and narrow — it names exactly the surface we depend
 * on, using the SDK's own param types, so a breaking change shows up as a type
 * error rather than a runtime one. Revisit when Privy promotes these to the
 * public client.
 */
interface PrivyLowLevelClient {
  users: { create(body: UserCreateParams): Promise<User> };
  keyQuorums: { create(body: KeyQuorumCreateParams): Promise<KeyQuorum> };
  organizations: { create(body: OrganizationCreateParams): Promise<Organization> };
  policies: { create(body: PolicyCreateParams): Promise<Policy> };
}

export const api = (privy as unknown as { privyApiClient: PrivyLowLevelClient })
  .privyApiClient;

// --- Arc testnet ------------------------------------------------------------
// USDC is Arc's native gas token, exposed two ways over ONE pool of funds:
//   - native view:  18 decimals, used only for gas and msg.value
//   - ERC-20 view:   6 decimals, at the address below — use this for everything
// Never sum the two views; they are the same money counted twice.
export const ARC_CHAIN_ID = 5042002;
export const ARC_CAIP2 = `eip155:${ARC_CHAIN_ID}` as const;
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
export const USDC_DECIMALS = 6;
export const EXPLORER = 'https://testnet.arcscan.app';

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL || undefined),
});

export async function usdcBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

export const usdc = (raw: bigint) => `${formatUnits(raw, USDC_DECIMALS)} USDC`;

// --- Resumable state --------------------------------------------------------
// The Arc spike needs a manual faucet step in the middle, so it stores the IDs
// it created and picks up where it left off on re-run. Gitignored.
const STATE_FILE = '.spike-state.json';

export type SpikeState = Record<string, string>;

export function loadState(): SpikeState {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

export function saveState(patch: SpikeState): SpikeState {
  const next = { ...loadState(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}

// --- Output -----------------------------------------------------------------
export const ok = (msg: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${msg}`);
export const info = (msg: string) => console.log(`        ${msg}`);
export const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

export function fail(msg: string, error: unknown): never {
  console.log(`  \x1b[31mFAIL\x1b[0m  ${msg}`);
  const e = error as { status?: number; message?: string; error?: string };
  if (e?.status) info(`HTTP ${e.status}`);
  info(e?.message ?? String(error));
  process.exit(1);
}
