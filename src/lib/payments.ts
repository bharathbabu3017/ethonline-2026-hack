import { encodeFunctionData, erc20Abi, isAddress, getAddress } from 'viem';
import { privy } from './privy-server';
import { activeChain, tokenBySymbol, type TokenConfig } from './chain';
import { publicClient } from './treasury';

/**
 * Turning a payment request into a Privy intent.
 *
 * The intent carries the exact transaction that will be signed. Nothing about
 * the amount or the recipient can change after this point without invalidating
 * the signatures collected against it.
 */

export function normalizeAddress(input: string): `0x${string}` {
  const trimmed = input.trim();
  if (!isAddress(trimmed)) throw new Error(`"${trimmed}" is not a valid wallet address`);
  return getAddress(trimmed); // EIP-55 checksum
}

export function transferCalldata(to: `0x${string}`, amountMicros: bigint) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amountMicros],
  });
}

/**
 * Create the intent that will move the money once enough people sign it.
 *
 * Which RPC method we use depends on the chain. Where Privy is authorized to
 * transact it signs and broadcasts for us, and fills in nonce and gas itself.
 * Where it is not — Arc today — it will only sign, so we must supply the whole
 * transaction and broadcast the result ourselves after approval.
 */
export async function createPaymentIntent(params: {
  walletId: string;
  treasuryAddress: `0x${string}`;
  payeeAddress: `0x${string}`;
  amountMicros: bigint;
}) {
  const data = transferCalldata(params.payeeAddress, params.amountMicros);

  if (activeChain.broadcastMode === 'privy-broadcast') {
    return privy.intents().rpc(params.walletId, {
      method: 'eth_sendTransaction',
      caip2: activeChain.caip2,
      params: {
        transaction: { to: activeChain.usdcAddress, data, value: '0x0' },
      },
    });
  }

  // self-broadcast: Privy has no RPC access to this chain, so it cannot
  // populate these. Note that fixing the nonce here is what makes a signed
  // transaction perishable — see the nonce staleness note in PLAN.md.
  const [nonce, fees, gas] = await Promise.all([
    publicClient.getTransactionCount({ address: params.treasuryAddress }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({
      account: params.treasuryAddress,
      to: activeChain.usdcAddress,
      data,
    }),
  ]);

  return privy.intents().rpc(params.walletId, {
    method: 'eth_signTransaction',
    params: {
      transaction: {
        to: activeChain.usdcAddress,
        data,
        value: '0x0',
        nonce: Number(nonce),
        chain_id: activeChain.chain.id,
        gas_limit: `0x${gas.toString(16)}`,
        max_fee_per_gas: `0x${fees.maxFeePerGas.toString(16)}`,
        max_priority_fee_per_gas: `0x${fees.maxPriorityFeePerGas.toString(16)}`,
        type: 2,
      },
    },
  });
}

/**
 * Privy intent statuses, normalized to the vocabulary the product uses.
 * Anything unrecognized stays PENDING rather than being reported as settled.
 */
export function normalizeStatus(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'executed':
      return 'EXECUTED';
    case 'failed':
      return 'FAILED';
    case 'rejected':
      return 'REJECTED';
    case 'expired':
    case 'dismissed':
      return 'EXPIRED';
    case 'processing':
      return 'PROCESSING';
    default:
      return 'PENDING';
  }
}

/**
 * The transaction that moves one asset.
 *
 * A native transfer carries the amount as `value` with no calldata; an ERC-20
 * transfer carries zero value and encodes the amount into a call to the token.
 * They are different transactions, and the policy rules that govern them differ
 * too — see buildGroupPolicy.
 */
export function buildTransfer(
  token: TokenConfig,
  to: `0x${string}`,
  amount: bigint,
): { to: `0x${string}`; data?: `0x${string}`; value: string } {
  if (token.address === null) {
    return { to, value: `0x${amount.toString(16)}` };
  }
  return {
    to: token.address,
    data: transferCalldata(to, amount),
    value: '0x0',
  };
}

export { tokenBySymbol };
