/**
 * Creates two payment intents against the most recent org — one under the
 * threshold, one over — and prints what Privy says about who may authorize each.
 *
 *   npm run dev:seed-payments
 */
import { db } from '../../src/lib/db.js';
import { createPaymentIntent } from '../../src/lib/payments.js';
import { privyApiRaw } from '../../src/lib/privy-server.js';
import { formatUsdc, toMicros } from '../../src/lib/money.js';
import { activeChain } from '../../src/lib/chain.js';

const org = await db.org.findFirst({ orderBy: { createdAt: 'desc' } });
if (!org) throw new Error('No org — run `npm run dev:seed-org` first');

console.log(`Org: ${org.name}\nTreasury: ${org.walletAddress}`);
console.log(`Threshold: ${formatUsdc(org.thresholdMicros)} USDC on ${activeChain.chain.name}\n`);

const payee = '0x000000000000000000000000000000000000dEaD' as const;

for (const amount of ['100', '2000']) {
  const micros = toMicros(amount);
  const route = micros <= org.thresholdMicros ? 'AUTO' : 'QUORUM';

  const intent = await createPaymentIntent({
    walletId: org.privyWalletId,
    treasuryAddress: org.walletAddress as `0x${string}`,
    payeeAddress: payee,
    amountMicros: micros,
  });

  const id = (intent as { intent_id?: string; id?: string }).intent_id
    ?? (intent as { id?: string }).id;

  const full = await privyApiRaw<{
    status?: string;
    authorization_details?: unknown;
  }>(`/v1/intents/${id}`);

  console.log(`${formatUsdc(micros)} USDC  route=${route}  status=${full.status}`);
  console.log(`  intent ${id}`);
  console.log(
    '  who can authorize:',
    JSON.stringify(full.authorization_details ?? {}, null, 2)
      .split('\n')
      .join('\n  '),
  );
  console.log();
}
