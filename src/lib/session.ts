import { bearerToken, privyApiRaw, requirePrivyUser, UnauthenticatedError } from './privy-server';
import { db } from './db';

export class NoOrgError extends Error {
  constructor() {
    super('You do not belong to an organization yet');
    this.name = 'NoOrgError';
  }
}

/**
 * Resolve the caller to a Member plus their Org, verifying their Privy token
 * first. Every route that touches org data starts here — it is the only place
 * that decides who someone is.
 */
export async function requireMember(request: Request) {
  const privyUserId = await requirePrivyUser(request);
  const member = await db.member.findUnique({
    where: { privyUserId },
    include: { org: true },
  });
  if (!member) throw new NoOrgError();

  // Members get their embedded wallet on first sign-in, after we created their
  // Privy user — so backfill it the first time we see them. This is what makes
  // paying a teammate by name possible.
  if (!member.walletAddress) {
    const address = await embeddedWalletAddress(privyUserId);
    if (address) {
      await db.member.update({ where: { id: member.id }, data: { walletAddress: address } });
      member.walletAddress = address;
    }
  }

  // The token comes back too: approving an intent means signing as this user.
  return { member, org: member.org, privyUserId, token: bearerToken(request) };
}

async function embeddedWalletAddress(privyUserId: string): Promise<string | null> {
  try {
    // privy.users().get() takes an identity token, not a user ID, so this
    // reads the user record over REST instead.
    const user = await privyApiRaw<{ linked_accounts?: unknown[] }>(
      `/v1/users/${privyUserId}`,
    );
    const accounts = (user.linked_accounts ?? []) as Array<{
      type?: string;
      chain_type?: string;
      address?: string;
      wallet_client_type?: string;
    }>;
    const wallet = accounts.find(
      (a) => a.type === 'wallet' && a.chain_type === 'ethereum' && a.address,
    );
    return wallet?.address ?? null;
  } catch {
    // Not fatal — the member simply can't be selected as an internal payee yet.
    return null;
  }
}

/** Map our auth errors onto HTTP responses, consistently across routes. */
export function sessionErrorResponse(error: unknown, tag: string): Response | null {
  if (error instanceof UnauthenticatedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof NoOrgError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  console.error(tag, error);
  return null;
}
