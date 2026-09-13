'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@privy-io/react-auth';
import { useApi } from '@/lib/use-api';
import { useApprovePayment } from '@/lib/use-approve';
import { formatUsdc } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import { Button, Card, ErrorNote, Field, inputClass } from '@/components/ui';

export default function NewPayment() {
  const router = useRouter();
  const { data: orgData } = useApi<OrgResponse>('/api/org');
  const approvePayment = useApprovePayment();
  const [payeeType, setPayeeType] = useState<'ADDRESS' | 'MEMBER'>('ADDRESS');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const org = orgData?.org;
  const threshold = org ? BigInt(org.thresholdMicros) : null;

  // Show which path this payment will take before it is submitted, so nobody is
  // surprised that it needs a second approver.
  const amountMicros = parseAmount(amount);
  const needsQuorum =
    threshold !== null && amountMicros !== null && amountMicros > threshold;

  // Members can only be paid once they have signed in and been given a wallet.
  const payableMembers = (org?.members ?? []).filter((m) => !m.isYou);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const form = new FormData(e.currentTarget);
      const token = await getAccessToken();
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);

      // Under the threshold the requester's own signature is enough, so sign
      // it now and the payment settles as part of submitting. It is a real
      // signature from their key — nothing here bypasses Privy.
      if (body.route === 'AUTO') {
        try {
          await approvePayment(body.id);
        } catch (signError) {
          setError(
            `Payment saved, but signing it failed: ${
              signError instanceof Error ? signError.message : String(signError)
            }`,
          );
          setBusy(false);
          return;
        }
      }
      router.push(`/payments/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New payment</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Paid in USDC from the shared treasury.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <input type="hidden" name="payeeType" value={payeeType} />

        <Card title="Who is being paid">
          <div className="mb-4 inline-flex rounded-lg border border-neutral-200 p-0.5">
            {(['ADDRESS', 'MEMBER'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPayeeType(t)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  payeeType === t
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {t === 'ADDRESS' ? 'Contractor or vendor' : 'Teammate'}
              </button>
            ))}
          </div>

          {payeeType === 'ADDRESS' ? (
            <div className="space-y-4">
              <Field label="Wallet address">
                <input
                  required
                  name="payeeAddress"
                  placeholder="0x…"
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label="Payee name" hint="Shown in payment history and the audit log.">
                <input name="payeeLabel" placeholder="Acme Design Co." className={inputClass} />
              </Field>
            </div>
          ) : (
            <Field
              label="Teammate"
              hint="Paid at their Privy embedded wallet — no address to copy."
            >
              <select required name="payeeMemberId" className={inputClass}>
                <option value="">Select a teammate…</option>
                {payableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Card>

        <Card title="Amount and details">
          <div className="space-y-4">
            <Field label="Amount (USDC)">
              <input
                required
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="250.00"
                className={inputClass}
              />
            </Field>

            {threshold !== null && amountMicros !== null && (
              <div
                className={`rounded-lg px-3 py-2.5 text-sm ${
                  needsQuorum
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-emerald-50 text-emerald-900'
                }`}
              >
                {needsQuorum ? (
                  <>
                    Above the {formatUsdc(threshold)} USDC limit — a second approver must
                    sign before this can be paid.
                  </>
                ) : (
                  <>
                    Within the {formatUsdc(threshold)} USDC limit — your signature alone
                    releases this payment.
                  </>
                )}
              </div>
            )}

            <Field label="Description">
              <input
                required
                name="memo"
                placeholder="October design retainer"
                className={inputClass}
              />
            </Field>

            <Field label="Invoice" hint="PDF, PNG, or JPEG, up to 10MB.">
              <input
                ref={fileRef}
                type="file"
                name="invoice"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-neutral-50"
              />
            </Field>
          </div>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit payment'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Mirrors the server's parsing so the preview cannot disagree with the outcome. */
function parseAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'));
}
