'use client';

import { useApi } from '@/lib/use-api';
import type { OrgResponse } from '@/components/app-shell';
import { Badge, Card, ErrorNote, PageHeader, Skeleton, Table } from '@/components/ui';

const ROLE_TONE = {
  ADMIN: 'indigo',
  APPROVER: 'green',
  MEMBER: 'neutral',
} as const;

export default function Team() {
  const { data, error, loading } = useApi<OrgResponse>('/api/org');

  if (loading) return <Skeleton className="h-64" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data?.org) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team management"
        description="Every member has a Privy embedded wallet, created on first sign-in. No seed phrases, and members can be paid at their own address."
      />

      <Card bodyClassName="">
        <Table
          head={
            <>
              <th className="px-5 py-2.5">Name</th>
              <th className="px-5 py-2.5">Email</th>
              <th className="px-5 py-2.5 text-right">Role</th>
            </>
          }
        >
            {data.org.members.map((m) => (
              <tr key={m.id} className="transition hover:bg-neutral-50/60">
                <td className="px-5 py-3 font-medium">
                  {m.name}
                  {m.isYou && <span className="ml-2 text-xs font-normal text-neutral-400">you</span>}
                </td>
                <td className="px-5 py-3 text-neutral-600">{m.email}</td>
                <td className="px-5 py-3 text-right">
                  <Badge tone={ROLE_TONE[m.role as keyof typeof ROLE_TONE] ?? 'neutral'}>
                    {m.role.toLowerCase()}
                  </Badge>
                </td>
              </tr>
            ))}
        </Table>
      </Card>

      <Card title="Changing the team">
        <p className="text-sm text-neutral-600">
          Adding or promoting an approver changes the quorum that owns the treasury, so
          Privy requires two existing approvers to sign that change as an intent — the same
          protection that applies to large payments. Coming in a later phase.
        </p>
      </Card>
    </div>
  );
}
