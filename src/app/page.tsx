'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { apiFetch } from '@/lib/use-api';
import { ApprovalDemo } from '@/components/approval-demo';
import { AuditTrailPreview, TeamRoles, TreasuryAssets } from '@/components/landing-visuals';

export default function Landing() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  // Signed-in users belong in the app: their org if they have one, setup if not.
  useEffect(() => {
    if (!ready || !authenticated) return;
    setRedirecting(true);
    let cancelled = false;
    (async () => {
      try {
        const { org } = await apiFetch<{ org: unknown | null }>('/api/org');
        if (!cancelled) router.replace(org ? '/dashboard' : '/onboarding');
      } catch {
        if (!cancelled) router.replace('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, router]);

  const cta = redirecting ? 'Signing in…' : 'Start with email';
  const signIn = () => login();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
              PG
            </div>
            <span className="text-sm font-semibold tracking-tight">PayGate</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-neutral-600 md:flex">
            <a href="#features" className="transition hover:text-neutral-900">
              Features
            </a>
            <a href="#how" className="transition hover:text-neutral-900">
              How it works
            </a>
            <a href="#security" className="transition hover:text-neutral-900">
              Security
            </a>
          </nav>
          <button
            onClick={signIn}
            disabled={!ready || redirecting}
            className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {redirecting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-2 lg:pt-20">
            <div>
              <span className="rise fade inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                B2B treasury operations
              </span>

              <h1 className="rise rise-1 mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-6xl">
                Business payouts
                <br />
                with approvals
                <br />
                built in.
              </h1>

              <p className="rise rise-2 mt-6 max-w-md text-lg leading-relaxed text-neutral-600">
                Pay contractors, vendors and staff from one company treasury — with a rule for
                every payment: who approves, how many, up to how much.
              </p>

              <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={signIn}
                  disabled={!ready || redirecting}
                  className="rounded-lg bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-60"
                >
                  {cta}
                </button>
                <span className="text-sm text-neutral-500">No seed phrase.</span>
              </div>
            </div>

            <div className="rise rise-2 lg:pl-6">
              <ApprovalDemo />
            </div>
          </div>
        </section>

        {/* At a glance */}
        <section className="border-y border-neutral-200 bg-neutral-50">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['4 assets', 'USDC, EURC, WETH and ETH from one treasury'],
              ['Unlimited rules', 'A group per team, each with its own limit'],
              ['2 clicks to pay', 'Request, approve, settled on-chain'],
              ['Full history', 'Every approval signed and recorded'],
            ].map(([stat, detail], i) => (
              <div key={stat} className={`rise rise-${i + 1}`}>
                <p className="text-xl font-semibold tracking-tight text-neutral-900">{stat}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Features
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Everything a finance team needs to move money safely.
          </h2>

          <div className="mt-16 space-y-24">
            <FeatureRow
              eyebrow="Approval groups"
              title="One treasury, a rule for every team"
              body="Payroll runs on one approval from HR under $10k. Grants need two from the committee. Vendors have no ceiling but always need two names. Each group is its own quorum and spending policy, so limits depend on who signs — not on which wallet the money sits in."
              points={[
                'Set approvals required and a per-payment limit',
                'Restrict a group to specific assets',
                'Payments route to the cheapest rule that allows them',
              ]}
              visual={<RulesVisual />}
            />

            <FeatureRow
              reverse
              eyebrow="Multi-asset treasury"
              title="Hold and pay in more than one currency"
              body="Stablecoins for payroll, EURC for European vendors, ETH for gas. One treasury holds all of it, balances update live, and each payment names the asset it moves. Amounts are never mixed across currencies."
              points={[
                'USDC, EURC, WETH and native ETH',
                'Per-asset balances and per-asset limits',
                'Correct decimals everywhere — no silent rounding',
              ]}
              visual={<TreasuryAssets />}
            />

            <FeatureRow
              eyebrow="Requests and invoices"
              title="The paperwork travels with the payment"
              body="Anyone on the team can raise a request: payee, amount, description, invoice attached. Before submitting, they see exactly which rule will govern it and who will need to approve — so nothing is a surprise later."
              points={[
                'PDF, PNG or JPEG invoices, verified by content',
                'Pay an external address or a teammate by name',
                'Requesters can withdraw their own request',
              ]}
              visual={<RequestVisual />}
            />

            <FeatureRow
              reverse
              eyebrow="Audit activity"
              title="A record you can hand to an auditor"
              body="Every request, approval, rejection and settlement is written down with who acted and when. Approvals are cryptographic signatures, not clicks — so the trail records what someone actually authorized."
              points={[
                'Filter by status, payee or requester',
                'Export the ledger to CSV, approvers included',
                'Each payment links to its on-chain transaction',
              ]}
              visual={<AuditTrailPreview />}
            />

            <FeatureRow
              eyebrow="Team and permissions"
              title="Roles that match how companies work"
              body="Admins configure the treasury and its rules. Approvers clear payments in the groups they belong to. Members raise requests and clear what their group allows. Changing the rules is itself an approved action."
              points={[
                'Admin, approver and member roles',
                'Members get an embedded wallet on first sign-in',
                'Treasury changes need the same sign-off as payments',
              ]}
              visual={<TeamRoles />}
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">How a payment works</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              <Step n={1} title="Request">
                Submit a payee, an amount, an asset and the invoice.
              </Step>
              <Step n={2} title="Route">
                It lands in the approval group whose rule covers it.
              </Step>
              <Step n={3} title="Approve">
                Approvers sign with their own keys, from their own browsers.
              </Step>
              <Step n={4} title="Settle">
                Signatures go to Privy, which verifies them and pays.
              </Step>
            </ol>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Security
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                PayGate never holds a key.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-neutral-600">
                The treasury is a Privy organization wallet — its private key lives in a secure
                enclave, not in our database and not in anyone&apos;s browser. Approvers sign
                with their own keys locally, and only the signature reaches us. Even fully
                compromised, PayGate cannot manufacture an approval.
              </p>
            </div>

            <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {[
                ['Organization wallets', 'One shared treasury per company, keys held in secure enclaves'],
                ['Key quorums', 'm-of-n approval, enforced per group'],
                ['Policies', 'Asset, chain and amount limits applied per signer'],
                ['Embedded wallets', 'Email sign-in, no seed phrase to lose'],
                ['Scoped signers', 'Each group signs only within its own policy'],
                ['Wallet administration', 'Rule changes require approval too'],
              ].map(([term, detail], i) => (
                <div key={term} className={`rise rise-${(i % 5) + 1}`}>
                  <dt className="text-sm font-semibold text-neutral-900">{term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-neutral-600">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Close */}
        <section className="border-t border-neutral-200 bg-neutral-900">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Set up your company treasury
              <br />
              in two minutes.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-neutral-400">
              Sign in with email, invite your team, and make your first payment today.
            </p>
            <button
              onClick={signIn}
              disabled={!ready || redirecting}
              className="mt-8 rounded-lg bg-white px-6 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60"
            >
              {cta}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-xs text-neutral-500">
          <span>PayGate — treasury payouts with approval controls</span>
          <span>USDC on Base Sepolia · testnet</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  points,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? 'lg:order-2' : ''}>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {eyebrow}
        </p>
        <h3 className="mt-2.5 text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-4 leading-relaxed text-neutral-600">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-neutral-700">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>{visual}</div>
    </div>
  );
}

function RulesVisual() {
  const groups = [
    { name: 'Payroll', who: 'HR · 2 people', rule: '1 approval', cap: '10,000 USDC' },
    { name: 'Grants', who: 'Committee · 4 people', rule: '2 approvals', cap: '50,000 USDC' },
    { name: 'Vendors', who: 'Finance · 3 people', rule: '2 approvals', cap: 'No limit' },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-900 bg-neutral-900 p-5 text-white">
        <p className="text-xs uppercase tracking-wider text-neutral-400">Treasury</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums">128,400.00 USDC</p>
        <p className="mt-3 border-t border-white/10 pt-2.5 font-mono text-[11px] text-neutral-500">
          0x56E4…ed07
        </p>
      </div>
      {groups.map((g) => (
        <div
          key={g.name}
          className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3.5 transition hover:border-neutral-300"
        >
          <div>
            <p className="text-sm font-semibold">{g.name}</p>
            <p className="text-xs text-neutral-500">{g.who}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{g.rule}</p>
            <p className="text-xs text-neutral-500">{g.cap}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestVisual() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        New payment
      </p>
      <div className="mt-5 space-y-4">
        <MockField label="Payee" value="Acme Design Co." />
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <MockField label="Amount" value="6,000.00" />
          <MockField label="Asset" value="USDC" />
        </div>
        <MockField label="Description" value="October design retainer" />
        <div>
          <p className="text-xs text-neutral-500">Invoice</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm text-neutral-600">
            📎 acme-oct-invoice.pdf
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <strong>Grants</strong> — needs 2 approvals from Ada, Ben.
      </div>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <div className="mt-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
        {value}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
        {n}
      </div>
      <h3 className="mt-4 text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{children}</p>
    </li>
  );
}
