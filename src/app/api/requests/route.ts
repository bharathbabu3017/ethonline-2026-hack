import { requireMember, sessionErrorResponse } from '@/lib/session';
import { db } from '@/lib/db';
import { toBaseUnits } from '@/lib/money';
import { storeInvoice, InvalidUploadError } from '@/lib/invoices';
import { buildTransfer, normalizeAddress } from '@/lib/payments';
import { activeChain, tokenBySymbol } from '@/lib/chain';
import { approvalsRequired } from '@/lib/settlement';
import { suggestGroup } from '@/lib/approval-groups';

/** Payment history for the caller's org, newest first. */
export async function GET(request: Request) {
  try {
    const { org, member } = await requireMember(request);


    const requests = await db.paymentRequest.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: { select: { name: true, email: true } },
        group: { include: { members: { select: { memberId: true } } } },
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
        assetSymbol: r.assetSymbol ?? tokenBySymbol(null).symbol,
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
        approvalsRequired: approvalsRequired(r),
        group: r.group
          ? { id: r.group.id, name: r.group.name, threshold: r.group.threshold }
          : null,
        youCanApprove: r.group
          ? r.group.members.some((m) => m.memberId === member.id)
          : true,
        isRequester: r.requesterId === member.id,
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

    const assetSymbol = String(form.get('asset') ?? activeChain.tokens[0].symbol);
    const token = activeChain.tokens.find((t) => t.symbol === assetSymbol);
    if (!token) return bad(`${assetSymbol} is not a treasury asset`);

    let amountMicros: bigint;
    try {
      amountMicros = toBaseUnits(amountRaw, assetSymbol);
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
        stored = await storeInvoice(file);
      } catch (e) {
        if (e instanceof InvalidUploadError) return bad(e.message);
        throw e;
      }
    }

    // Which approval rule governs this payment. An explicit choice wins;
    // otherwise take the cheapest rule that still permits the amount.
    let group = null;
    const requestedGroupId = String(form.get('groupId') ?? '').trim();
    if (requestedGroupId) {
      group = await db.approvalGroup.findFirst({
        where: { id: requestedGroupId, orgId: org.id },
      });
      if (!group) return bad('That approval group does not exist');
      const allowed = group.allowedAssets?.split(',') ?? null;
      if (allowed && !allowed.includes(assetSymbol)) {
        return bad(`"${group.name}" cannot release ${assetSymbol}`);
      }
      if (group.maxAmountMicros !== null) {
        const cap = group.maxAmountMicros * 10n ** BigInt(token.decimals);
        if (amountMicros > cap) {
          return bad(
            `"${group.name}" can release at most ${group.maxAmountMicros} ${assetSymbol} per payment`,
          );
        }
      }
    } else {
      group = await suggestGroup(org.id, amountMicros, assetSymbol);
    }

    const route = amountMicros <= org.thresholdMicros ? 'AUTO' : 'QUORUM';

    // The exact transaction that will be submitted once approved. Stored so
    // what gets executed is fixed at submit time and cannot drift afterwards.
    const transaction = buildTransfer(token, payeeAddress, amountMicros);

    const created = await db.paymentRequest.create({
      data: {
        orgId: org.id,
        requesterId: member.id,
        payeeType,
        payeeAddress,
        payeeMemberId,
        payeeLabel,
        amountMicros,
        assetSymbol,
        memo,
        route,
        groupId: group?.id ?? null,
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
              asset: assetSymbol,
              payeeLabel,
              payeeAddress,
              route,
              group: group?.name ?? null,
              invoice: stored?.filename ?? null,
            }),
          },
        },
      },
    });

    return Response.json(
      {
        id: created.id,
        route,
        status: 'PENDING',
        group: group ? { name: group.name, threshold: group.threshold } : null,
        // One approval means the requester's own signature finishes it.
        settlesImmediately: (group?.threshold ?? (route === 'QUORUM' ? 2 : 1)) === 1,
      },
      { status: 201 },
    );
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
