'use client';

import { useApi } from '@/lib/use-api';
import { formatUnits } from 'viem';
import {
  Badge,
  Card,
  DataRow,
  ErrorNote,
  PageHeader,
  Skeleton,
  Truncated,
} from '@/components/ui';

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
      <PageHeader
        title="Security controls"
        description={
          <>
            Read live from Privy, not from this app&apos;s database. These are the records
            Privy evaluates when someone tries to move money — editing PayGate&apos;s own
            data would not change anything on this page.
          </>
        }
      />

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
        <dl className="mt-4 divide-y divide-neutral-100">
          <DataRow label="Policy ID" value={<Truncated value={data.policy.id} />} />
          <DataRow
            label="Amount cap"
            value={
              cap ? (
                <strong className="tabular-nums">{cap} USDC</strong>
              ) : (
                <span className="text-neutral-400">No cap</span>
              )
            }
          />
          <DataRow label="Only this token" value={<Truncated value={data.chain.usdc} />} />
          <DataRow label="Only this chain" value={<Truncated value={data.chain.caip2} />} />
          <DataRow label="Method" value={<Truncated value={data.chain.rpcMethod} head={24} />} />
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
        <dl className="divide-y divide-neutral-100">
          <DataRow label="Wallet ID" value={<Truncated value={data.wallet.id} />} />
          <DataRow label="Address" value={<Truncated value={data.wallet.address} head={16} />} />
          <DataRow
            label="Privy organization"
            value={<Truncated value={data.wallet.organizationId} />}
          />
          <DataRow
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
      <dl className="mt-4 divide-y divide-neutral-100">
        <DataRow label="Quorum ID" value={<Truncated value={quorum.id} />} />
        <DataRow
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
