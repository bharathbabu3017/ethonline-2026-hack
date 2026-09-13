import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { toMicros } from '@/lib/money';
import { storeInvoice, InvalidUploadError } from '@/lib/invoices';
import { normalizeAddress, transferCalldata } from '@/lib/payments';
import { activeChain } from '@/lib/chain';
import { approvalsRequired } from '@/lib/settlement';

/** Payment history for the caller's org, newest first. */
export async function GET(request: Request) {
  try {
    const { org, member } = await requireMember(request);


    const requests = await db.paymentRequest.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: { select: { name: true, email: true } },
        invoices: { select: { id: true, filename: true } },
        approvals: {
          include: { member: { select: { id: true, name: true } } },
        },
      },
      take: 100,
    });

    return Response.json({
      requests: requests.map((r) => ({
        id: r.id,
        payeeLabel: r.payeeLabel,
        payeeAddress: r.payeeAddress,
        amountMicros: r.amountMicros.toString(),
        memo: r.memo,
        route: r.route,
        status: r.status,
        txHash: r.txHash,
        failureReason: r.failureReason,
        createdAt: r.createdAt.toISOString(),
        requester: r.requester,
        invoices: r.invoices,
        approvals: r.approvals.map((a) => ({
          memberId: a.memberId,
          name: a.member.name,
          kind: a.kind,
          at: a.createdAt.toISOString(),
        })),
        approvalsRequired: approvalsRequired(r.route),
        youApproved: r.approvals.some((a) => a.memberId === member.id),
      })),
      explorerBase: activeChain.explorerTxUrl(''),
    });
  } catch (error) {
    return sessionErrorResponse(error, '[api/requests GET]') ?? serverError(error);
  }
}

/** Submit a payment request. Multipart, because an invoice comes with it. */
export async function POST(request: Request) {
  try {
    const { member, org } = await requireMember(request);
    const form = await request.formData();

    const amountRaw = String(form.get('amount') ?? '');
    const memo = String(form.get('memo') ?? '').trim();
    const payeeType = String(form.get('payeeType') ?? 'ADDRESS');

    let amountMicros: bigint;
    try {
      amountMicros = toMicros(amountRaw);
    } catch (e) {
      return bad((e as Error).message);
    }
    if (!memo) return bad('Add a short description of what this payment is for');

    // Resolve the payee to a concrete address now, so history stays truthful
    // even if a teammate's wallet changes later.
    let payeeAddress: `0x${string}`;
    let payeeLabel: string;
    let payeeMemberId: string | null = null;

    if (payeeType === 'MEMBER') {
      const id = String(form.get('payeeMemberId') ?? '');
      const payee = await db.member.findFirst({ where: { id, orgId: org.id } });
      if (!payee) return bad('That teammate is not in your organization');
      if (!payee.walletAddress) {
        return bad(`${payee.name} has not signed in yet, so they have no wallet to pay`);
      }
      payeeAddress = payee.walletAddress as `0x${string}`;
      payeeLabel = payee.name;
      payeeMemberId = payee.id;
    } else {
      try {
        payeeAddress = normalizeAddress(String(form.get('payeeAddress') ?? ''));
      } catch (e) {
        return bad((e as Error).message);
      }
      payeeLabel = String(form.get('payeeLabel') ?? '').trim() || 'External payee';
    }

    // Store the invoice before creating the intent, so a rejected upload never
    // leaves an orphaned intent behind.
    const file = form.get('invoice');
    let stored = null;
    if (file instanceof File && file.size > 0) {
      try {
        stored = await storeInvoice(file, org.id);
      } catch (e) {
        if (e instanceof InvalidUploadError) return bad(e.message);
        throw e;
      }
    }

    const route = amountMicros <= org.thresholdMicros ? 'AUTO' : 'QUORUM';

    // The exact transaction that will be submitted once approved. Stored so
    // what gets executed is fixed at submit time and cannot drift afterwards.
    const transaction = {
      to: activeChain.usdcAddress,
      data: transferCalldata(payeeAddress, amountMicros),
      value: '0x0',
    };

    const created = await db.paymentRequest.create({
      data: {
        orgId: org.id,
        requesterId: member.id,
        payeeType,
        payeeAddress,
        payeeMemberId,
        payeeLabel,
        amountMicros,
        memo,
        route,
        requestBody: JSON.stringify(transaction),
        status: 'PENDING',
        invoices: stored
          ? { create: { ...stored, uploadedById: member.id } }
          : undefined,
        events: {
          create: {
            orgId: org.id,
            actorId: member.id,
            type: 'REQUEST_SUBMITTED',
            payload: JSON.stringify({
              amountMicros: amountMicros.toString(),
              payeeLabel,
              payeeAddress,
              route,
              invoice: stored?.filename ?? null,
            }),
          },
        },
      },
    });

    return Response.json({ id: created.id, route, status: 'PENDING' }, { status: 201 });
  } catch (error) {
    return sessionErrorResponse(error, '[api/requests POST]') ?? serverError(error);
  }
}

const bad = (message: string) => Response.json({ error: message }, { status: 400 });

function serverError(error: unknown) {
  // Privy validation messages are usually actionable, so pass the text through.
  const message = error instanceof Error ? error.message : 'Internal error';
  return Response.json({ error: message }, { status: 500 });
}
