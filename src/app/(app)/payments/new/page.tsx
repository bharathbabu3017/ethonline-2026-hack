'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@privy-io/react-auth';
import { useApi } from '@/lib/use-api';
import { useApprovePayment } from '@/lib/use-approve';
import { formatAmount } from '@/lib/money';
import type { OrgResponse } from '@/components/app-shell';
import type { ApprovalGroup } from '../../groups/page';
import { activeChain } from '@/lib/chain';
import { Button, Card, ErrorNote, Field, PageHeader, inputClass } from '@/components/ui';

export default function NewPayment() {
  const router = useRouter();
  const { data: orgData } = useApi<OrgResponse>('/api/org');
  const { data: groupData } = useApi<{ groups: ApprovalGroup[] }>('/api/groups');
  const [groupId, setGroupId] = useState('');
  const approvePayment = useApprovePayment();
  const [payeeType, setPayeeType] = useState<'ADDRESS' | 'MEMBER'>('ADDRESS');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState(activeChain.tokens[0].symbol);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const org = orgData?.org;
  const threshold = org ? BigInt(org.thresholdMicros) : null;

  const token = activeChain.tokens.find((t) => t.symbol === asset) ?? activeChain.tokens[0];
  const amountMicros = parseAmount(amount, token.decimals);
  const balance = org?.balances.find((b) => b.symbol === asset);
  const overBalance =
    balance !== undefined && amountMicros !== null && amountMicros > BigInt(balance.balance);
  const groups = groupData?.groups ?? [];

  // Which rule will govern this payment: the explicit choice, or the cheapest
  // group that permits the amount. Shown before submitting so nobody is
  // surprised that it needs a second approver.
  const chosen = groups.find((g) => g.id === groupId) ?? null;
  const suggested =
    amountMicros === null
      ? null
      : [...groups]
          .filter((g) => !g.allowedAssets || g.allowedAssets.includes(asset))
          .filter(
            (g) =>
              g.maxAmountMicros === null ||
              amountMicros <= BigInt(g.maxAmountMicros) * 10n ** BigInt(token.decimals),
          )
          .sort((a, b) => a.threshold - b.threshold)[0] ?? null;
  const effective = chosen ?? suggested;
  const overGroupLimit =
    chosen?.maxAmountMicros != null &&
    amountMicros !== null &&
    amountMicros > BigInt(chosen.maxAmountMicros) * 10n ** BigInt(token.decimals);

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
      if (body.settlesImmediately) {
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="New payment"
        description="Paid in USDC from the shared treasury, once it has the approvals its group requires."
      />

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
            <input type="hidden" name="asset" value={asset} />
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <Field label="Amount">
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
              <Field label="Asset">
                <select
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  className={inputClass}
                >
                  {activeChain.tokens.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {balance && (
              <p className="-mt-1 text-xs text-neutral-500">
                Treasury holds {formatAmount(BigInt(balance.balance), asset)} {asset}
                {token.isGasToken && ' — also used for gas, so leave some spare'}
              </p>
            )}

            {overBalance && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
                More than the treasury holds in {asset}.
              </div>
            )}

            <Field
              label="Approval group"
              hint="Leave on automatic to use the cheapest rule that allows this amount."
            >
              <select
                name="groupId"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className={inputClass}
              >
                <option value="">Automatic</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} — {g.threshold} approval{g.threshold === 1 ? '' : 's'}
                    {g.maxAmountMicros ? `, up to ${g.maxAmountMicros} per payment` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {overGroupLimit && chosen?.maxAmountMicros && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {chosen.name} can release at most{' '}
                {String(chosen.maxAmountMicros)} {asset} per payment. Pick another group or
                lower the amount.
              </div>
            )}

            {!overGroupLimit && effective && amountMicros !== null && (
              <div
                className={`rounded-lg px-3 py-2.5 text-sm ${
                  effective.threshold > 1
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-emerald-50 text-emerald-900'
                }`}
              >
                {effective.threshold > 1 ? (
                  <>
                    <strong>{effective.name}</strong> — needs {effective.threshold} approvals
                    from {effective.members.map((m) => m.name).join(', ')}.
                  </>
                ) : (
                  <>
                    <strong>{effective.name}</strong> — your signature alone releases this
                    payment.
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
          <Button type="submit" disabled={busy || overBalance}>
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
function parseAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0'));
}
