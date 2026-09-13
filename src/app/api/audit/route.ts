import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';

/**
 * The org's activity trail — every org, member, payment, approval and
 * settlement event, newest first.
 *
 * Actor IDs are resolved to names here rather than in the UI: events store
 * whoever acted at the time, and some are system-generated with no actor.
 */
export async function GET(request: Request) {
  try {
    const { org } = await requireMember(request);

    const [events, members] = await Promise.all([
      db.auditEvent.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          request: {
            select: {
              id: true,
              payeeLabel: true,
              amountMicros: true,
              assetSymbol: true,
              memo: true,
            },
          },
        },
      }),
      db.member.findMany({
        where: { orgId: org.id },
        select: { id: true, name: true, privyUserId: true },
      }),
    ]);

    // Events record either a Member id or, for org creation, a Privy user id.
    const nameFor = new Map<string, string>();
    for (const m of members) {
      nameFor.set(m.id, m.name);
      nameFor.set(m.privyUserId, m.name);
    }

    return Response.json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        actor: e.actorId ? (nameFor.get(e.actorId) ?? 'Unknown') : null,
        at: e.createdAt.toISOString(),
        payload: safeParse(e.payload),
        request: e.request
          ? {
              id: e.request.id,
              payeeLabel: e.request.payeeLabel,
              amountMicros: e.request.amountMicros.toString(),
              assetSymbol: e.request.assetSymbol,
              memo: e.request.memo,
            }
          : null,
      })),
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/audit]') ??
      Response.json({ error: 'Could not load activity' }, { status: 500 })
    );
  }
}

/** Payloads are written by us, but a malformed one should not break the page. */
function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
