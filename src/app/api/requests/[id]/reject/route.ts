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

    const payment = await db.paymentRequest.findFirst({ where: { id, orgId: org.id } });
    if (!payment) return Response.json({ error: 'Payment not found' }, { status: 404 });
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
          payload: JSON.stringify({ by: member.name }),
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
