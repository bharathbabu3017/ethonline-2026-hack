import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';

/**
 * Reject a pending payment.
 *
 * Nothing needs to be undone at Privy — a payment is only ever submitted once
 * it has the approvals it needs, so rejecting simply closes it out here and it
 * can never be settled.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { member, org } = await requireMember(request);
    const { id } = await params;

    const payment = await db.paymentRequest.findFirst({
      where: { id, orgId: org.id },
      include: { group: { include: { members: true } } },
    });
    if (!payment) return Response.json({ error: 'Payment not found' }, { status: 404 });

    // Turning a payment down is the same authority as releasing it, so it is
    // limited to the group that governs it. A requester can always withdraw
    // their own request, whichever group it was assigned to.
    const isRequester = payment.requesterId === member.id;
    const inGroup =
      !payment.group || payment.group.members.some((m) => m.memberId === member.id);
    if (!isRequester && !inGroup) {
      return Response.json(
        { error: `Only members of "${payment.group?.name}" can reject this payment` },
        { status: 403 },
      );
    }
    if (payment.status !== 'PENDING') {
      return Response.json(
        { error: `This payment is already ${payment.status.toLowerCase()}` },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.paymentRequest.update({
        where: { id: payment.id },
        data: { status: 'REJECTED' },
      }),
      db.approval.upsert({
        where: { requestId_memberId: { requestId: payment.id, memberId: member.id } },
        create: { requestId: payment.id, memberId: member.id, kind: 'REJECTED' },
        update: { kind: 'REJECTED' },
      }),
      db.auditEvent.create({
        data: {
          orgId: org.id,
          requestId: payment.id,
          actorId: member.id,
          type: 'REJECTED',
          payload: JSON.stringify({
            by: member.name,
            // Withdrawing your own request reads differently from an approver
            // turning it down, and the trail should say which happened.
            withdrawn: isRequester && !inGroup,
          }),
        },
      }),
    ]);

    return Response.json({ status: 'REJECTED' });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/requests reject]') ??
      Response.json(
        { error: error instanceof Error ? error.message : 'Could not reject' },
        { status: 500 },
      )
    );
  }
}
