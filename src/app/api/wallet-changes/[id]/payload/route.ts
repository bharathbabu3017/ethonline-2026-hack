import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { signableRequest } from '@/lib/wallet-changes';

/** The wallet update an approver's browser must sign. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { org } = await requireMember(request);
    const { id } = await params;

    const change = await db.walletChange.findFirst({ where: { id, orgId: org.id } });
    if (!change) return Response.json({ error: 'Change not found' }, { status: 404 });

    return Response.json({
      signThis: signableRequest(org.privyWalletId, change.requestBody),
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/wallet-changes payload]') ??
      Response.json({ error: 'Could not build signing payload' }, { status: 500 })
    );
  }
}
