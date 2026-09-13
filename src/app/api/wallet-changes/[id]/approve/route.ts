import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { applyWalletChange } from '@/lib/wallet-changes';

/**
 * Record an approver's signature on a treasury change, and apply it once the
 * owner quorum's threshold is met.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { member, org } = await requireMember(request);
    const { id } = await params;

    // Owner-level changes are restricted to approvers — the same people the
    // Privy owner quorum contains.
    if (member.role === 'MEMBER') {
      return Response.json(
        { error: 'Only approvers can authorize treasury changes' },
        { status: 403 },
      );
    }

    const change = await db.walletChange.findFirst({
      where: { id, orgId: org.id },
      include: { approvals: true },
    });
    if (!change) return Response.json({ error: 'Change not found' }, { status: 404 });
    if (change.status !== 'PENDING') {
      return Response.json(
        { error: `This change is already ${change.status.toLowerCase()}` },
        { status: 409 },
      );
    }
    if (change.approvals.some((a) => a.memberId === member.id)) {
      return Response.json({ error: 'You have already approved this change' }, { status: 409 });
    }

    const { signature } = (await request.json().catch(() => ({}))) as { signature?: string };
    if (!signature) {
      return Response.json(
        { error: 'This approval was not signed. Reload the page and try again.' },
        { status: 400 },
      );
    }

    await db.walletChangeApproval.create({
      data: { changeId: change.id, memberId: member.id, signature },
    });
    await db.auditEvent.create({
      data: {
        orgId: org.id,
        actorId: member.id,
        type: 'WALLET_CHANGE_APPROVED',
        payload: JSON.stringify({ change: change.description }),
      },
    });

    const approved = change.approvals.length + 1;
    if (approved < org.ownerThreshold) {
      return Response.json({ status: 'PENDING', approved, required: org.ownerThreshold });
    }

    const applied = await applyWalletChange(change.id);
    return Response.json({
      status: applied.status,
      failureReason: applied.failureReason,
      approved,
      required: org.ownerThreshold,
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/wallet-changes approve]') ??
      Response.json(
        { error: error instanceof Error ? error.message : 'Could not approve' },
        { status: 500 },
      )
    );
  }
}
