'use client';

/**
 * Static previews of real screens, for the landing page.
 *
 * Deliberately hard-coded: these illustrate the product to a visitor who has no
 * account, so they must not depend on data, auth, or the chain being reachable.
 */

export function TreasuryAssets() {
  const assets = [
    { symbol: 'USDC', name: 'USD Coin', amount: '128,400.00', share: 78 },
    { symbol: 'EURC', name: 'Euro Coin', amount: '24,150.00', share: 15 },
    { symbol: 'WETH', name: 'Wrapped Ether', amount: '3.42', share: 5 },
    { symbol: 'ETH', name: 'Ether', amount: '0.81', share: 2, gas: true },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Treasury assets
        </p>
        <span className="text-xs text-neutral-400">Base</span>
      </div>

      <ul className="mt-5 space-y-4">
        {assets.map((a) => (
          <li key={a.symbol}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">
                {a.symbol}
                {a.gas && <span className="ml-1.5 text-xs text-neutral-400">gas</span>}
              </span>
              <span className="text-sm tabular-nums text-neutral-900">{a.amount}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-900/80"
                style={{ width: `${a.share}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuditTrailPreview() {
  const events = [
    { tone: 'green', label: 'Paid', text: '6,000.00 USDC to Acme Design Co.', when: '2 min ago' },
    { tone: 'amber', label: 'Approved', text: 'Ben approved 6,000.00 USDC', when: '3 min ago' },
    { tone: 'amber', label: 'Approved', text: 'Ada approved 6,000.00 USDC', when: '11 min ago' },
    { tone: 'neutral', label: 'Requested', text: 'Carol requested 6,000.00 USDC', when: '14 min ago' },
  ] as const;

  const tones = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <div className="border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Audit activity
        </p>
      </div>
      <ul className="divide-y divide-neutral-100">
        {events.map((e, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[e.tone]}`}
            >
              {e.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">{e.text}</span>
            <span className="shrink-0 text-xs text-neutral-400">{e.when}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-neutral-100 px-5 py-2.5">
        <span className="font-mono text-[11px] text-indigo-600">
          0x68b7…b446d3 · block 46767647
        </span>
      </div>
    </div>
  );
}

export function TeamRoles() {
  const rows = [
    { name: 'Ada Chen', role: 'Admin', groups: 'All groups' },
    { name: 'Ben Okafor', role: 'Approver', groups: 'Grants, Vendors' },
    { name: 'Carol Diaz', role: 'Member', groups: 'Payroll' },
  ];

  const tone: Record<string, string> = {
    Admin: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    Approver: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Member: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <div className="border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Team</p>
      </div>
      <ul className="divide-y divide-neutral-100">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                {r.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')}
              </div>
              <div>
                <p className="text-sm font-medium leading-tight">{r.name}</p>
                <p className="text-xs text-neutral-500">{r.groups}</p>
              </div>
            </div>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[r.role]}`}
            >
              {r.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
