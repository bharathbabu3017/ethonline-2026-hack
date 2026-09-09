import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight capitalize">payments</h1>
      <Card>
        <p className="text-sm text-neutral-600">
          Arriving in the next phase: submitting payment requests with invoices, and
          collecting approvals as Privy intents.
        </p>
      </Card>
    </div>
  );
}
