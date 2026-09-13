import { PrivyClient } from '@privy-io/node';
import type {
  IntentResponse,
  KeyQuorum,
  KeyQuorumCreateParams,
  Organization,
  OrganizationCreateParams,
  Policy,
  PolicyCreateParams,
  User,
  UserCreateParams,
} from '@privy-io/node/resources';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — see .env.example`);
  return value;
}

/** Server-side Privy client. Never import this from a client component. */
export const privy = new PrivyClient({
  appId: required('PRIVY_APP_ID'),
  appSecret: required('PRIVY_APP_SECRET'),
});

/**
 * The low-level resource client, reached through a private field.
 *
 * @privy-io/node@0.34's public client is missing methods the docs show:
 * users.create, keyQuorums.create, every organizations method, and
 * intents.get/list/reject. They exist only on the underlying resource client,
 * which the SDK marks private.
 *
 * The cast is deliberate and narrow — it names exactly the surface we depend
 * on, using the SDK's own param types, so a breaking change surfaces as a type
 * error rather than at runtime. Revisit when Privy promotes these.
 */
interface PrivyLowLevelClient {
  users: { create(body: UserCreateParams): Promise<User> };
  keyQuorums: {
    create(body: KeyQuorumCreateParams): Promise<KeyQuorum>;
    get(keyQuorumId: string): Promise<KeyQuorum>;
  };
  organizations: { create(body: OrganizationCreateParams): Promise<Organization> };
  policies: {
    create(body: PolicyCreateParams): Promise<Policy>;
    get(policyId: string): Promise<Policy>;
  };
  intents: {
    get(intentId: string): Promise<IntentResponse>;
    reject(intentId: string): Promise<IntentResponse>;
  };
}

export const privyApi = (
  privy as unknown as { privyApiClient: PrivyLowLevelClient }
).privyApiClient;

/**
 * Escape hatch for Privy REST endpoints the SDK does not expose at all.
 *
 * The one that matters is `POST /v1/intents/{id}/authorize` — there is no
 * `intents.authorize()` on either client, only the `IntentAuthorizeInput` type,
 * so appending an approval signature has to go over HTTP.
 */
export async function privyApiRaw<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const appId = required('PRIVY_APP_ID');
  const credentials = Buffer.from(`${appId}:${required('PRIVY_APP_SECRET')}`).toString('base64');

  const response = await fetch(`https://api.privy.io${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Basic ${credentials}`,
      'privy-app-id': appId,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Privy ${init?.method ?? 'GET'} ${path} failed (${response.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export class UnauthenticatedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Verify the caller's Privy access token and return their user ID.
 *
 * Every API route calls this before doing anything. The token comes from
 * `getAccessToken()` on the client, sent as a bearer token.
 */
/** The caller's raw access token, needed when they must sign something. */
export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new UnauthenticatedError('Missing bearer token');
  return token;
}

export async function requirePrivyUser(request: Request): Promise<string> {
  const token = bearerToken(request);

  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    return claims.user_id;
  } catch {
    // Deliberately opaque: never echo token-parsing detail back to the caller.
    throw new UnauthenticatedError('Invalid or expired token');
  }
}
