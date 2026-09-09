/**
 * Exercises the real org-setup path against Privy without needing a browser
 * login. Creates a throwaway org and prints the treasury address to fund.
 *
 *   npm run dev:seed-org
 */
import { privyApi } from '../../src/lib/privy-server.js';
import { createOrganization } from '../../src/lib/org-setup.js';
import { activeChain } from '../../src/lib/chain.js';
import { toMicros, formatUsdc } from '../../src/lib/money.js';

const stamp = Date.now();
const email = (who: string) => `${who}-${stamp}@example.com`;

const creator = await privyApi.users.create({
  linked_accounts: [{ type: 'email', address: email('founder') }],
});

const org = await createOrganization({
  name: `Northwind Trading ${stamp}`,
  thresholdMicros: toMicros('500'),
  creatorPrivyUserId: creator.id,
  creatorEmail: email('founder'),
  creatorName: 'Ada Founder',
  members: [
    { email: email('approver'), name: 'Bo Approver', role: 'APPROVER' },
    { email: email('member'), name: 'Cy Member', role: 'MEMBER' },
  ],
});

console.log(`
Organization created on ${activeChain.chain.name}

  Treasury    ${org.walletAddress}
  Threshold   ${formatUsdc(org.thresholdMicros)} USDC
  Approvers   ${org.approverQuorumId}
  Members     ${org.memberQuorumId}
  Policy      ${org.memberPolicyId}
  Privy org   ${org.privyOrgId}

Fund the treasury, then sign in as ${email('founder')} to see it.
`);
