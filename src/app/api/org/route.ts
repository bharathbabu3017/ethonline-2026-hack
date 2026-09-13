import { requirePrivyUser, UnauthenticatedError } from '@/lib/privy-server';
import { db } from '@/lib/db';
import { createOrganization, type MemberInput } from '@/lib/org-setup';
import { activeChain } from '@/lib/chain';
import { toMicros } from '@/lib/money';
import { treasuryBalances } from '@/lib/treasury';

/** The org the caller belongs to, plus their membership and the live balance. */
export async function GET(request: Request) {
  try {
    const privyUserId = await requirePrivyUser(request);
    const member = await db.member.findUnique({
      where: { privyUserId },
      include: { org: { include: { members: true } } },
    });

    if (!member) return Response.json({ org: null }, { status: 200 });

    const { org } = member;
    const balances = await treasuryBalances(org.walletAddress as `0x${string}`);
    // Kept for callers that still read a single headline figure.
    const balance = balances.find((b) => b.symbol === 'USDC')?.balance ?? 0n;

    return Response.json({
      org: {
        id: org.id,
        name: org.name,
        walletAddress: org.walletAddress,
        thresholdMicros: org.thresholdMicros.toString(),
        balanceMicros: balance.toString(),
        balances: balances.map((b) => ({
          symbol: b.symbol,
          name: b.name,
          balance: b.balance.toString(),
          isGasToken: b.isGasToken,
          isStable: b.isStable,
        })),
        chain: {
          name: activeChain.chain.name,
          id: activeChain.chain.id,
          gasIsUsdc: activeChain.gasIsUsdc,
          faucets: activeChain.faucets,
        },
        members: org.members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          isYou: m.privyUserId === privyUserId,
        })),
      },
      me: { id: member.id, name: member.name, role: member.role },
    });
  } catch (error) {
    return errorResponse(error, '[api/org GET]');
  }
}

export async function POST(request: Request) {
  try {
    const privyUserId = await requirePrivyUser(request);

    const existing = await db.member.findUnique({ where: { privyUserId } });
    if (existing) {
      return Response.json({ error: 'You already belong to an organization' }, { status: 409 });
    }

    const body = (await request.json()) as {
      name?: string;
      threshold?: string;
      creatorName?: string;
      creatorEmail?: string;
      members?: MemberInput[];
    };

    const name = body.name?.trim();
    if (!name) return Response.json({ error: 'Organization name is required' }, { status: 400 });
    if (!body.creatorEmail?.trim()) {
      return Response.json({ error: 'Your email is required' }, { status: 400 });
    }

    let thresholdMicros: bigint;
    try {
      thresholdMicros = toMicros(body.threshold ?? '500');
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }

    const members = (body.members ?? []).filter((m) => m.email?.trim());
    for (const m of members) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) {
        return Response.json({ error: `"${m.email}" is not a valid email` }, { status: 400 });
      }
    }

    const org = await createOrganization({
      name,
      thresholdMicros,
      members,
      creatorPrivyUserId: privyUserId,
      creatorEmail: body.creatorEmail.trim(),
      creatorName: body.creatorName?.trim() || body.creatorEmail.split('@')[0],
    });

    return Response.json({ orgId: org.id, walletAddress: org.walletAddress }, { status: 201 });
  } catch (error) {
    return errorResponse(error, '[api/org POST]');
  }
}

function errorResponse(error: unknown, tag: string) {
  if (error instanceof UnauthenticatedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  console.error(tag, error);
  // Setup failures are usually actionable (a Privy validation message), so
  // surface the text rather than a generic 500.
  const message = error instanceof Error ? error.message : 'Internal error';
  return Response.json({ error: message }, { status: 500 });
}
