/**
 * Spike 2 — are the Privy primitives PayGate is built on available on this app?
 *
 * Privy's docs call key quorums "an advanced feature — reach out to discuss
 * whether this setup is right for your integration," which suggests they may be
 * gated per app. If they are, Phase 2 cannot be built and you need Privy to
 * enable them — a human dependency worth discovering on day one, not day three.
 *
 * This walks the entire Phase 2 setup path end to end, so a pass means the org
 * plumbing is known-good before any UI exists.
 *
 * Run:  npm run spike:privy
 *
 * Creates throwaway objects on your Privy app. Safe to run repeatedly; each run
 * uses fresh emails so nothing collides.
 */
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import {
  privy,
  api,
  ARC_CAIP2,
  ARC_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  ok,
  info,
  step,
  fail,
} from './_shared.js';

const run = Date.now();
const email = (who: string) => `paygate-spike-${run}-${who}@example.com`;

// $500, in raw 6-decimal units, as the hex string policy conditions expect.
const THRESHOLD = parseUnits('500', USDC_DECIMALS);
const THRESHOLD_HEX = `0x${THRESHOLD.toString(16)}`;

/** Minimal ERC-20 transfer ABI. The input name must match the policy's field path. */
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

async function main() {
  step('1. Create users (org members)');
  let alice: string, bob: string, carol: string;
  try {
    const made = await Promise.all(
      ['alice', 'bob', 'carol'].map((who) =>
        api.users.create({
          linked_accounts: [{ type: 'email', address: email(who) }],
        }),
      ),
    );
    [alice, bob, carol] = made.map((u) => u.id);
    ok(`3 users created`);
    info(`alice ${alice}`);
  } catch (e) {
    fail('Could not create users', e);
  }

  step('2. Create the Approvers key quorum (2-of-2)');
  let approverQuorumId: string;
  try {
    const quorum = await api.keyQuorums.create({
      user_ids: [alice, bob],
      authorization_threshold: 2,
      display_name: `Spike Approvers ${run}`,
    });
    approverQuorumId = quorum.id;
    ok(`Approvers quorum ${approverQuorumId} — threshold 2`);
  } catch (e) {
    fail(
      'Key quorums are unavailable. If this is a permissions error, ask Privy to\n' +
        '        enable key quorums on the app — Phase 2 is blocked until they do.',
      e,
    );
  }

  step('3. Create the Members key quorum (1-of-3)');
  let memberQuorumId: string;
  try {
    const quorum = await api.keyQuorums.create({
      user_ids: [alice, bob, carol],
      authorization_threshold: 1,
      display_name: `Spike Members ${run}`,
    });
    memberQuorumId = quorum.id;
    ok(`Members quorum ${memberQuorumId} — threshold 1`);
  } catch (e) {
    fail('Could not create the Members quorum', e);
  }

  step('4. Create the capped spending policy');
  info(`Allow USDC transfers on Arc up to ${THRESHOLD_HEX} (500 USDC)`);
  let policyId: string;
  try {
    const policy = await api.policies.create({
      version: '1.0',
      name: `Spike under-threshold ${run}`,
      chain_type: 'ethereum',
      rules: [
        {
          name: 'Allow small USDC transfers on Arc',
          method: 'eth_sendTransaction',
          action: 'ALLOW',
          conditions: [
            {
              field_source: 'ethereum_transaction',
              field: 'to',
              operator: 'eq',
              value: USDC_ADDRESS,
            },
            {
              field_source: 'ethereum_transaction',
              field: 'chain_id',
              operator: 'eq',
              value: String(ARC_CHAIN_ID),
            },
            {
              field_source: 'ethereum_calldata',
              field: 'transfer.amount',
              abi: TRANSFER_ABI,
              operator: 'lte',
              value: THRESHOLD_HEX,
            },
          ],
        },
      ],
    });
    policyId = policy.id;
    ok(`Policy ${policyId}`);
    info('Policies are allowlists — anything no rule ALLOWs is denied.');
  } catch (e) {
    fail(
      'Could not create the policy. If it rejected the calldata condition, the\n' +
        '        threshold may need enforcing at the app layer instead (see PLAN.md risks).',
      e,
    );
  }

  step('5. Create the organization');
  let orgId: string;
  try {
    const org = await api.organizations.create({
      display_name: `Spike Co ${run}`,
      default_key_quorum_id: approverQuorumId,
    });
    orgId = org.id;
    ok(`Organization ${orgId}`);
  } catch (e) {
    fail('Organizations are unavailable — ask Privy to enable them on the app', e);
  }

  step('6. Create the treasury wallet owned by the org');
  let walletId: string, walletAddress: string;
  try {
    const wallet = await privy.wallets().create({
      chain_type: 'ethereum',
      entity: { id: orgId, type: 'organization' },
      additional_signers: [
        { signer_id: memberQuorumId, override_policy_ids: [policyId] },
      ],
    });
    walletId = wallet.id;
    walletAddress = wallet.address;
    ok(`Treasury ${walletAddress}`);
    info(`owner_id ${wallet.owner_id} (should be the Approvers quorum)`);
    if (wallet.owner_id !== approverQuorumId) {
      info('\x1b[33mNote: owner is not the default key quorum — check Phase 2 wiring.\x1b[0m');
    }
  } catch (e) {
    fail('Could not create the org wallet with additional_signers', e);
  }

  step('7. Propose an over-threshold payment as an intent');
  info('$2,000 — above the policy cap, so it should need the Approvers quorum');
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [
        '0x000000000000000000000000000000000000dEaD',
        parseUnits('2000', USDC_DECIMALS),
      ],
    });
    const intent = await privy.intents().rpc(walletId, {
      method: 'eth_sendTransaction',
      caip2: ARC_CAIP2,
      params: { transaction: { to: USDC_ADDRESS, data, value: '0x0' } },
    });
    ok(`Intent created, status "${intent.status}"`);
    info(JSON.stringify(intent.authorization_details ?? {}, null, 2).slice(0, 600));
  } catch (e) {
    fail('Could not create an intent against the org wallet', e);
  }

  console.log(`
\x1b[32mSpike 2 passed.\x1b[0m Every primitive Phase 2 needs is available:
users, key quorums, policies, organizations, org wallets with scoped signers,
and intents.

Still unverified, and deliberately out of scope here: authorizing an intent.
@privy-io/node@0.34 exposes no intents.authorize() on either client, so Phase 4
signs via generateAuthorizationSignature() and POSTs to /v1/intents/:id/authorize.
That needs a logged-in user's JWT, so it gets tested in the app, not a script.

Org ${orgId}
Treasury ${walletAddress}
`);
}

main().catch((e) => fail('Unexpected error', e));
