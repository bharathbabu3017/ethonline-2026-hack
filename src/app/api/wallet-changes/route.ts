import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';

/** Pending and recent treasury configuration changes. */
export async function GET(request: Request) {
  try {
    const { org, member } = await requireMember(request);

    const changes = await db.walletChange.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        approvals: { include: { member: { select: { id: true, name: true } } } },
        group: { select: { id: true, name: true, threshold: true } },
      },
    });

    // Only approvers can authorize an owner-level change.
    const canApprove = member.role !== 'MEMBER';

    return Response.json({
      changes: changes.map((c) => ({
        id: c.id,
        type: c.type,
        description: c.description,
        status: c.status,
        failureReason: c.failureReason,
        createdAt: c.createdAt.toISOString(),
        group: c.group,
        approvals: c.approvals.map((a) => ({
          memberId: a.memberId,
          name: a.member.name,
          at: a.createdAt.toISOString(),
        })),
        approvalsRequired: org.ownerThreshold,
        youApproved: c.approvals.some((a) => a.memberId === member.id),
        youCanApprove: canApprove,
      })),
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/wallet-changes GET]') ??
      Response.json({ error: 'Could not load treasury changes' }, { status: 500 })
    );
  }
}
