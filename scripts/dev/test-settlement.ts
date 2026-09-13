/**
 * Moves real USDC from the org treasury, end to end, to prove settlement works.
 *
 *   npm run dev:test-settlement
 */
import { db } from '../../src/lib/db.js';
import { settlePayment } from '../../src/lib/settlement.js';
import { activeChain } from '../../src/lib/chain.js';
import { transferCalldata } from '../../src/lib/payments.js';
import { toMicros, formatUsdc } from '../../src/lib/money.js';
import { treasuryBalance } from '../../src/lib/treasury.js';

const org = await db.org.findFirst({
  where: { members: { some: {} } },
  include: { members: true },
  orderBy: { createdAt: 'desc' },
});
if (!org) throw new Error('No org — create one in the app first');

const PAYEE = '0x000000000000000000000000000000000000dEaD' as const;
const amount = toMicros('0.05');

const before = await treasuryBalance(org.walletAddress as `0x${string}`);
console.log(`${org.name}\n  treasury ${org.walletAddress}\n  balance  ${formatUsdc(before)} USDC\n`);

const payment = await db.paymentRequest.create({
  data: {
    orgId: org.id,
    requesterId: org.members[0].id,
    payeeType: 'ADDRESS',
    payeeAddress: PAYEE,
    payeeLabel: 'Settlement test',
    amountMicros: amount,
    memo: 'Settlement smoke test',
    route: 'AUTO',
    requestBody: JSON.stringify({
      to: activeChain.usdcAddress,
      data: transferCalldata(PAYEE, amount),
      value: '0x0',
    }),
    approvals: { create: { memberId: org.members[0].id, kind: 'AUTHORIZED' } },
  },
});

console.log(`submitting ${formatUsdc(amount)} USDC…`);
const settled = await settlePayment(payment.id);
console.log(`  status ${settled.status}`);
if (settled.txHash) console.log(`  ${activeChain.explorerTxUrl(settled.txHash)}`);
if (settled.failureReason) console.log(`  ${settled.failureReason}`);

const after = await treasuryBalance(org.walletAddress as `0x${string}`);
console.log(`\n  balance ${formatUsdc(before)} -> ${formatUsdc(after)} USDC`);
