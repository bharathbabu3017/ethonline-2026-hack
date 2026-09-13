import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { createApprovalGroup } from '@/lib/approval-groups';
import { toMicros } from '@/lib/money';

/** The org's approval rules, with their members. */
export async function GET(request: Request) {
  try {
    const { org, member } = await requireMember(request);
    const groups = await db.approvalGroup.findMany({
      where: { orgId: org.id },
      orderBy: [{ isDefault: 'desc' }, { threshold: 'asc' }, { createdAt: 'asc' }],
      include: { members: { include: { member: { select: { id: true, name: true } } } } },
    });

    return Response.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        threshold: g.threshold,
        maxAmountMicros: g.maxAmountMicros?.toString() ?? null,
        isDefault: g.isDefault,
        attachedToWallet: g.attachedToWallet,
        privyQuorumId: g.privyQuorumId,
        privyPolicyId: g.privyPolicyId,
        members: g.members.map((m) => ({ id: m.member.id, name: m.member.name })),
        youCanApprove: g.members.some((m) => m.memberId === member.id),
      })),
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/groups GET]') ??
      Response.json({ error: 'Could not load approval groups' }, { status: 500 })
    );
  }
}

/** Create a new approval rule. Admins only — this governs how money leaves. */
export async function POST(request: Request) {
  try {
    const { org, member } = await requireMember(request);
    if (member.role !== 'ADMIN') {
      return Response.json(
        { error: 'Only an admin can create approval groups' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      threshold?: number;
      maxAmount?: string | null;
      memberIds?: string[];
    };

    const name = body.name?.trim();
    if (!name) return Response.json({ error: 'Give the group a name' }, { status: 400 });

    const threshold = Number(body.threshold ?? 1);
    if (!Number.isInteger(threshold) || threshold < 1) {
      return Response.json({ error: 'Approvals required must be 1 or more' }, { status: 400 });
    }

    let maxAmountMicros: bigint | null = null;
    if (body.maxAmount != null && String(body.maxAmount).trim() !== '') {
      try {
        maxAmountMicros = toMicros(String(body.maxAmount));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
    }

    const group = await createApprovalGroup({
      orgId: org.id,
      name,
      description: body.description?.trim(),
      threshold,
      maxAmountMicros,
      memberIds: body.memberIds ?? [],
      proposedById: member.id,
    });

    await db.auditEvent.create({
      data: {
        orgId: org.id,
        actorId: member.id,
        type: 'GROUP_CREATED',
        payload: JSON.stringify({
          name: group.name,
          threshold: group.threshold,
          members: group.members.length,
        }),
      },
    });

    return Response.json({ id: group.id }, { status: 201 });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/groups POST]') ??
      Response.json(
        { error: error instanceof Error ? error.message : 'Could not create group' },
        { status: 500 },
      )
    );
  }
}
