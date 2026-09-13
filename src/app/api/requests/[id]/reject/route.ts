import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';

/**
 * Close a pending payment without paying it.
 *
 * Two distinct acts share this route: the governing group *rejecting* a
 * payment, and the requester *withdrawing* their own. They close the payment
 * the same way but mean different things, so the caller says which it is and
 * the audit trail records it.
 *
 * Nothing needs undoing at Privy — a payment only reaches it once it already
 * has the approvals it needs.
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

    const { withdraw } = (await request.json().catch(() => ({}))) as { withdraw?: boolean };
    // Only the person who raised it can withdraw it; anyone else in the group
    // is rejecting it, whatever the client claims.
    const withdrawn = Boolean(withdraw) && isRequester;
    if (withdraw && !isRequester) {
      return Response.json(
        { error: 'Only the requester can withdraw this payment' },
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
          payload: JSON.stringify({ by: member.name, withdrawn }),
        },
      }),
    ]);

    return Response.json({ status: 'REJECTED', withdrawn });
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
