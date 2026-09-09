'use client';

import { useApi } from '@/lib/use-api';
import type { OrgResponse } from '@/components/app-shell';
import { Badge, Card, ErrorNote, Skeleton } from '@/components/ui';

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Every member has a Privy embedded wallet, created on first sign-in. No seed
          phrases, and members can be paid at their own address.
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 text-right font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {data.org.members.map((m) => (
              <tr key={m.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-3">
                  {m.name}
                  {m.isYou && <span className="ml-2 text-xs text-neutral-400">you</span>}
                </td>
                <td className="py-3 text-neutral-600">{m.email}</td>
                <td className="py-3 text-right">
                  <Badge tone={ROLE_TONE[m.role as keyof typeof ROLE_TONE] ?? 'neutral'}>
                    {m.role.toLowerCase()}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
