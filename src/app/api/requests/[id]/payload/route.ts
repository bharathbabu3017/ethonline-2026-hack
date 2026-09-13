import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { activeChain } from '@/lib/chain';

/**
 * The exact request an approver's browser must sign.
 *
 * Built from the transaction stored at submit time, so every approver signs
 * identical bytes and the signatures can be submitted together.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { org } = await requireMember(request);
    const { id } = await params;

    const payment = await db.paymentRequest.findFirst({ where: { id, orgId: org.id } });
    if (!payment) return Response.json({ error: 'Payment not found' }, { status: 404 });
    if (!payment.requestBody) {
      return Response.json({ error: 'This payment predates signed approvals' }, { status: 409 });
    }

    return Response.json({
      signThis: {
        version: 1,
        method: 'POST',
        url: `https://api.privy.io/v1/wallets/${org.privyWalletId}/rpc`,
        body: {
          method: activeChain.rpcMethod,
          caip2: activeChain.caip2,
          params: { transaction: JSON.parse(payment.requestBody) },
        },
        headers: { 'privy-app-id': process.env.PRIVY_APP_ID },
      },
    });
  } catch (error) {
    return (
      sessionErrorResponse(error, '[api/requests payload]') ??
      Response.json({ error: 'Could not build signing payload' }, { status: 500 })
    );
  }
}
