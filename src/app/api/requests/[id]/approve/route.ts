import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { settlePayment, approvalsRequired, NotEnoughApprovals } from '@/lib/settlement';

/**
 * Record the caller's approval, and settle the payment if it now has enough.
 *
 * See src/lib/settlement.ts for how the threshold is enforced and why it is
 * currently checked here rather than by Privy.
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
      include: { approvals: true },
    });
    if (!payment) return Response.json({ error: 'Payment not found' }, { status: 404 });

    if (payment.status !== 'PENDING') {
      return Response.json(
        { error: `This payment is already ${payment.status.toLowerCase()}` },
        { status: 409 },
      );
    }
    if (payment.approvals.some((a) => a.memberId === member.id)) {
      return Response.json({ error: 'You have already approved this payment' }, { status: 409 });
    }
    // The approver's browser signs the payment; we only store the result.
    const { signature } = (await request.json().catch(() => ({}))) as { signature?: string };
    if (!signature) {
      return Response.json(
        { error: 'This approval was not signed. Reload the page and try again.' },
        { status: 400 },
      );
    }

    await db.approval.create({
      data: { requestId: payment.id, memberId: member.id, kind: 'AUTHORIZED', signature },
    });
    await db.auditEvent.create({
      data: {
        orgId: org.id,
        requestId: payment.id,
        actorId: member.id,
        type: 'APPROVED',
        payload: JSON.stringify({ by: member.name }),
      },
    });

    const approved = payment.approvals.filter((a) => a.kind === 'AUTHORIZED').length + 1;
    const required = approvalsRequired(payment.route);

    if (approved < required) {
      return Response.json({ status: 'PENDING', approved, required });
    }

    const settled = await settlePayment(payment.id);
    return Response.json({
      status: settled.status,
      txHash: settled.txHash,
      failureReason: settled.failureReason,
      approved,
      required,
    });
  } catch (error) {
    if (error instanceof NotEnoughApprovals) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return (
      sessionErrorResponse(error, '[api/requests approve]') ??
      Response.json(
        { error: error instanceof Error ? error.message : 'Could not approve' },
        { status: 500 },
      )
    );
  }
}
