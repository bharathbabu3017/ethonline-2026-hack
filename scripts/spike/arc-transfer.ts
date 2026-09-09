/**
 * Spike 1 — can Privy move USDC on Arc?
 *
 * ANSWERED. Privy will NOT broadcast to Arc:
 *
 *   eth_sendTransaction caip2 eip155:5042002
 *   -> 401 {"error":"App is not authorized to transact on chain eip155:5042002"}
 *
 * Arc is not on the app's authorized-chain list, and that list is controlled by
 * Privy — it is not in the app settings API, so it can't be self-served. Worth
 * asking Privy to add Arc, but not worth waiting on.
 *
 * Privy WILL sign for Arc. eth_signTransaction is not chain-gated, because
 * signing needs no RPC access to the network. So the working split is:
 *
 *   Privy   — holds the key, enforces quorum + policy, returns a signed tx
 *   PayGate — populates nonce/gas and broadcasts the signed tx via viem
 *
 * This keeps the security model fully intact. Policies evaluate on the signing
 * request, so an over-threshold payment still cannot get a signature without
 * the Approvers quorum. The backend gains only the ability to delay or drop a
 * broadcast — it cannot alter the amount or the recipient, both of which are
 * covered by the signature.
 *
 * Run:  npm run spike:arc
 *
 * The middle step needs a human (the faucet), so the script is resumable:
 * run it, fund the address it prints, run it again.
 */
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import {
  privy,
  ARC_CAIP2,
  ARC_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  EXPLORER,
  publicClient,
  usdcBalance,
  usdc,
  loadState,
  saveState,
  ok,
  info,
  step,
  fail,
} from './_shared.js';

const SEND_AMOUNT = parseUnits('0.01', USDC_DECIMALS);

async function getOrCreateWallet(
  key: string,
  label: string,
): Promise<{ id: string; address: `0x${string}` }> {
  const state = loadState();
  if (state[`${key}Id`] && state[`${key}Address`]) {
    info(`${label}: reusing ${state[`${key}Address`]}`);
    return {
      id: state[`${key}Id`],
      address: state[`${key}Address`] as `0x${string}`,
    };
  }
  const wallet = await privy.wallets().create({ chain_type: 'ethereum' });
  saveState({ [`${key}Id`]: wallet.id, [`${key}Address`]: wallet.address });
  ok(`${label} created: ${wallet.address}`);
  return { id: wallet.id, address: wallet.address as `0x${string}` };
}

async function main() {
  step('1. Create wallets');
  let treasury, payee;
  try {
    treasury = await getOrCreateWallet('treasury', 'Treasury');
    payee = await getOrCreateWallet('payee', 'Payee');
  } catch (e) {
    fail('Could not create a Privy wallet — check PRIVY_APP_ID / PRIVY_APP_SECRET', e);
  }

  step('2. Check Arc RPC reachable');
  try {
    const chainId = await publicClient.getChainId();
    if (chainId !== ARC_CHAIN_ID) {
      throw new Error(`RPC reports chain ${chainId}, expected ${ARC_CHAIN_ID}`);
    }
    ok(`Arc testnet reachable, chain ${chainId}`);
  } catch (e) {
    fail('Cannot reach the Arc RPC — check ARC_RPC_URL', e);
  }

  step('3. Check treasury is funded');
  const balance = await usdcBalance(treasury.address);
  info(`Treasury balance: ${usdc(balance)}`);
  if (balance < SEND_AMOUNT) {
    console.log(`
  \x1b[33mNEEDS FUNDING\x1b[0m

  Send test USDC to the treasury, then run this script again:

    Address:  ${treasury.address}
    Faucet:   https://faucet.circle.com   (choose Arc Testnet)

  Nothing is broken — the script stops here because the next step spends money.
`);
    process.exit(0);
  }
  ok(`Funded with ${usdc(balance)}`);

  step('4. Confirm Privy still refuses to broadcast on Arc');
  info(`eth_sendTransaction caip2 ${ARC_CAIP2}`);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [payee.address, SEND_AMOUNT],
  });
  try {
    await privy.wallets().ethereum().sendTransaction(treasury.id, {
      caip2: ARC_CAIP2,
      params: { transaction: { to: USDC_ADDRESS, data, value: '0x0' } },
    });
    info('\x1b[33mPrivy now broadcasts on Arc — it did not before.\x1b[0m');
    info('Revisit PLAN.md: the simpler eth_sendTransaction path may be available.');
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 401) fail(`Expected 401, got ${status}`, e);
    ok('Rejected with 401 as expected — app not authorized to transact on Arc');
  }

  step('5. Sign with Privy, broadcast ourselves');
  // Privy is not authorized for Arc's RPC, so it cannot populate nonce or gas.
  // We supply every field, and the signature then covers all of them.
  const [nonce, fees, gas] = await Promise.all([
    publicClient.getTransactionCount({ address: treasury.address }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({
      account: treasury.address,
      to: USDC_ADDRESS,
      data,
    }),
  ]);
  info(`nonce ${nonce}, gas ${gas}, maxFeePerGas ${fees.maxFeePerGas}`);

  let hash: `0x${string}`;
  try {
    const signed = await privy.wallets().ethereum().signTransaction(treasury.id, {
      params: {
        transaction: {
          to: USDC_ADDRESS,
          data,
          value: '0x0',
          nonce: Number(nonce),
          chain_id: ARC_CHAIN_ID,
          gas_limit: `0x${gas.toString(16)}`,
          max_fee_per_gas: `0x${fees.maxFeePerGas.toString(16)}`,
          max_priority_fee_per_gas: `0x${fees.maxPriorityFeePerGas.toString(16)}`,
          type: 2,
        },
      },
    });
    ok('Privy signed the Arc transaction');

    hash = await publicClient.sendRawTransaction({
      serializedTransaction: signed.signed_transaction as `0x${string}`,
    });
    ok('Broadcast accepted by the Arc RPC');
    info(`${EXPLORER}/tx/${hash}`);
  } catch (e) {
    fail('Sign-and-broadcast failed — no fallback left, escalate to Privy', e);
  }

  step('6. Confirm on-chain');
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });
    if (receipt.status !== 'success') throw new Error(`Reverted in block ${receipt.blockNumber}`);
    ok(`Confirmed in block ${receipt.blockNumber}`);
  } catch (e) {
    fail('Transaction did not confirm', e);
  }

  const payeeBalance = await usdcBalance(payee.address);
  if (payeeBalance < SEND_AMOUNT) {
    fail(`Payee balance is ${usdc(payeeBalance)}, expected at least ${usdc(SEND_AMOUNT)}`, null);
  }
  ok(`Payee received the funds — balance now ${usdc(payeeBalance)}`);
  info(`Treasury now ${usdc(await usdcBalance(treasury.address))} (transfer + gas, both USDC)`);

  console.log(`
\x1b[32mSpike 1 passed.\x1b[0m USDC moves on Arc under Privy's key.

Privy signs; PayGate broadcasts. Phase 3 uses eth_signTransaction, not
eth_sendTransaction, and owns nonce and gas estimation.
`);
}

main().catch((e) => fail('Unexpected error', e));
