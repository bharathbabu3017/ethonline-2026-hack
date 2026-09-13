/**
 * Full path against real Privy: create an org, then settle a payment from its
 * treasury, proving the app authorization key is accepted.
 *
 *   npm run dev:verify
 */
import { privyApi } from '../../src/lib/privy-server.js';
import { createOrganization } from '../../src/lib/org-setup.js';
import { db } from '../../src/lib/db.js';
import { settlePayment, NotEnoughApprovals } from '../../src/lib/settlement.js';
import { activeChain } from '../../src/lib/chain.js';
import { transferCalldata } from '../../src/lib/payments.js';
import { toMicros, formatUsdc } from '../../src/lib/money.js';
import { treasuryBalance } from '../../src/lib/treasury.js';

const stamp = Date.now();
const email = (w: string) => `verify-${w}-${stamp}@example.com`;

const creator = await privyApi.users.create({
  linked_accounts: [{ type: 'email', address: email('founder') }],
});

const org = await createOrganization({
  name: `Verify Co ${stamp}`,
  thresholdMicros: toMicros('5'),
  creatorPrivyUserId: creator.id,
  creatorEmail: email('founder'),
  creatorName: 'Verifier',
  members: [{ email: email('approver'), name: 'Second Approver', role: 'APPROVER' }],
});
console.log(`org       ${org.name}`);
console.log(`treasury  ${org.walletAddress}`);
console.log(`balance   ${formatUsdc(await treasuryBalance(org.walletAddress as `0x${string}`))} USDC\n`);

const PAYEE = '0x000000000000000000000000000000000000dEaD' as const;
const amount = toMicros('1');
const payment = await db.paymentRequest.create({
  data: {
    orgId: org.id,
    requesterId: org.members[0].id,
    payeeType: 'ADDRESS',
    payeeAddress: PAYEE,
    payeeLabel: 'Verification payee',
    amountMicros: amount,
    memo: 'End-to-end verification',
    route: 'AUTO',
    requestBody: JSON.stringify({
      to: activeChain.usdcAddress,
      data: transferCalldata(PAYEE, amount),
      value: '0x0',
    }),
  },
});

console.log('1. settle with NO approvals recorded (must refuse):');
try {
  await settlePayment(payment.id);
  console.log('   ❌ executed — the approval gate is not working');
} catch (e) {
  console.log(`   ✅ refused: ${(e as Error).message}`);
  if (!(e instanceof NotEnoughApprovals)) console.log('   (unexpected error type)');
}

await db.approval.create({
  data: { requestId: payment.id, memberId: org.members[0].id, kind: 'AUTHORIZED' },
});

console.log('\n2. settle with the required approval:');
const settled = await settlePayment(payment.id);
console.log(`   status ${settled.status}`);
if (settled.txHash) console.log(`   ${activeChain.explorerTxUrl(settled.txHash)}`);
if (settled.failureReason) console.log(`   ${settled.failureReason}`);

const sigAccepted = !/rejected the signature|Missing/i.test(settled.failureReason ?? '');
console.log(
  `\nApp authorization key accepted by Privy: ${sigAccepted ? 'YES' : 'NO'}`,
);
console.log(`Fund ${org.walletAddress} to see a real transfer complete.`);
