import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { proposeGroupAttachment } from '@/lib/wallet-changes';

/**
 * Request that a group be attached to the treasury as a Privy signer.
 *
 * Groups created during org setup — and any created before this flow existed —
 * have no attachment proposal, so their rules are enforced by PayGate rather
 * than by Privy. This raises the proposal; approvers then sign it like any
 * other treasury change.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { member, org } = await requireMember(request);
    const { id } = await params;

    if (member.role !== 'ADMIN') {
      return Response.json(
        { error: 'Only an admin can request a treasury change' },
        { status: 403 },
      );
    }

    const group = await db.approvalGroup.findFirst({ where: { id, orgId: org.id } });
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 });
    if (group.attachedToWallet) {
      return Response.json({ error: 'This group is already attached' }, { status: 409 });
    }

    // Don't stack duplicate proposals for the same group.
    const existing = await db.walletChange.findFirst({
      where: { orgId: org.id, groupId: group.id, status: 'PENDING' },
    });
    if (existing) {
      return Response.json(
        { error: 'An attachment for this group is already awaiting approval' },
        { status: 409 },
      );
    }

    const change = await proposeGroupAttachment({
      orgId: org.id,
      groupId: group.id,
      groupName: group.name,
      createdById: member.id,
    });

    return Response.json({ id: change.id }, { status: 201 });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/groups attach]') ??
      Response.json(
        { error: error instanceof Error ? error.message : 'Could not request attachment' },
        { status: 500 },
      )
    );
  }
}
