/**
 * Creates the two default approval groups for any org that predates them.
 *
 *   npm run dev:backfill-groups
 */
import { db } from '../../src/lib/db.js';
import { createApprovalGroup } from '../../src/lib/approval-groups.js';
import { formatUsdc } from '../../src/lib/money.js';

for (const org of await db.org.findMany({ include: { members: true, groups: true } })) {
  if (org.groups.length > 0) {
    console.log(`${org.name}: already has ${org.groups.length} group(s)`);
    continue;
  }
  const approvers = org.members.filter((m) => m.role !== 'MEMBER').map((m) => m.id);
  const all = org.members.map((m) => m.id);
  if (all.length === 0) {
    console.log(`${org.name}: no members, skipping`);
    continue;
  }

  await createApprovalGroup({
    orgId: org.id,
    name: 'Standard payments',
    description: `Any team member can release up to ${formatUsdc(org.thresholdMicros)} USDC on their own signature.`,
    threshold: 1,
    maxAmountMicros: org.thresholdMicros,
    memberIds: all,
    isDefault: true,
  });

  if (approvers.length >= 2) {
    await createApprovalGroup({
      orgId: org.id,
      name: 'Large payments',
      description: 'Anything above the standard limit needs two approvers.',
      threshold: 2,
      maxAmountMicros: null,
      memberIds: approvers,
    });
  }
  console.log(`${org.name}: groups created`);
}
