'use client';

import { useApi } from '@/lib/use-api';
import { formatUnits } from 'viem';
import { Badge, Card, ErrorNote, Mono, Skeleton } from '@/components/ui';

/**
 * The Controls page reads Privy directly rather than our own database, so what
 * it shows is the enforcement itself and not a description of it.
 */

interface QuorumMember {
  type: string;
  user_id?: string;
  public_key?: string;
}
interface Quorum {
  id: string;
  display_name?: string;
  authorization_threshold?: number;
  threshold?: number;
  members?: QuorumMember[];
  user_ids?: string[];
}
interface ControlsResponse {
  wallet: { id: string; address: string; organizationId: string };
  chain: {
    name: string;
    id: number;
    caip2: string;
    usdc: string;
    broadcastMode: string;
    rpcMethod: string;
  };
  approverQuorum: Quorum;
  memberQuorum: Quorum;
  policy: { id: string; name?: string; rules?: unknown[] };
}

const thresholdOf = (q: Quorum) => q.authorization_threshold ?? q.threshold ?? 1;
const sizeOf = (q: Quorum) => q.members?.length ?? q.user_ids?.length ?? 0;

export default function Controls() {
  const { data, error, loading } = useApi<ControlsResponse>('/api/org/controls');

  if (loading) return <Skeleton className="h-96" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const cap = findAmountCap(data.policy);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Controls</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Read live from Privy, not from this app&apos;s database. These are the records
          Privy evaluates inside its secure enclave every time someone tries to move money —
          editing PayGate&apos;s own data would not change anything on this page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <QuorumCard
          title="Approvers quorum"
          quorum={data.approverQuorum}
          tone="indigo"
          note="Owns the treasury. Can authorize any payment, and is the only way an over-threshold payment moves."
        />
        <QuorumCard
          title="Members quorum"
          quorum={data.memberQuorum}
          tone="neutral"
          note="Added to the wallet as a scoped additional signer. One signature is enough, but only within the policy below."
        />
      </div>

      <Card title="Spending policy">
        <p className="-mt-1 text-sm text-neutral-600">
          Attached to the Members quorum as an override policy. Privy policies are
          allowlists: anything no rule permits is denied.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Policy ID" value={<Mono>{data.policy.id}</Mono>} />
          <Row
            label="Amount cap"
            value={cap ? <strong>{cap} USDC</strong> : <span className="text-neutral-400">—</span>}
          />
          <Row label="Only this token" value={<Mono>{data.chain.usdc}</Mono>} />
          <Row label="Only this chain" value={<Mono>{data.chain.caip2}</Mono>} />
          <Row label="Method" value={<Mono>{data.chain.rpcMethod}</Mono>} />
        </dl>

        <details className="mt-5 border-t border-neutral-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700">
            Raw policy from Privy
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
            {JSON.stringify(data.policy, null, 2)}
          </pre>
        </details>
      </Card>

      <Card title="Treasury wallet">
        <dl className="space-y-3 text-sm">
          <Row label="Wallet ID" value={<Mono>{data.wallet.id}</Mono>} />
          <Row label="Address" value={<Mono>{data.wallet.address}</Mono>} />
          <Row label="Privy organization" value={<Mono>{data.wallet.organizationId}</Mono>} />
          <Row
            label="Settlement"
            value={
              <span className="flex items-center justify-end gap-2">
                {data.chain.name} <Badge tone="neutral">{data.chain.broadcastMode}</Badge>
              </span>
            }
          />
        </dl>
      </Card>
    </div>
  );
}

function QuorumCard({
  title,
  quorum,
  note,
  tone,
}: {
  title: string;
  quorum: Quorum;
  note: string;
  tone: 'indigo' | 'neutral';
}) {
  const threshold = thresholdOf(quorum);
  const size = sizeOf(quorum);
  return (
    <Card title={title} action={<Badge tone={tone}>{threshold} of {size}</Badge>}>
      <p className="-mt-1 text-sm text-neutral-600">{note}</p>
      <dl className="mt-4 space-y-3 text-sm">
        <Row label="Quorum ID" value={<Mono>{quorum.id}</Mono>} />
        <Row
          label="Signatures required"
          value={
            <strong>
              {threshold} of {size}
            </strong>
          }
        />
      </dl>
    </Card>
  );
}

/** Pull the `transfer.amount` cap out of the policy for display. */
function findAmountCap(policy: { rules?: unknown[] }): string | null {
  try {
    for (const rule of policy.rules ?? []) {
      const conditions = (rule as { conditions?: unknown[] }).conditions ?? [];
      for (const c of conditions) {
        const cond = c as { field?: string; value?: string };
        if (cond.field?.endsWith('.amount') && typeof cond.value === 'string') {
          return formatUnits(BigInt(cond.value), 6);
        }
      }
    }
  } catch {
    /* display-only; fall through to null */
  }
  return null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}
