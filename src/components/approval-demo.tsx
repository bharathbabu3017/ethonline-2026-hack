'use client';

import { useEffect, useState } from 'react';

/**
 * A payment walking through approval, looping.
 *
 * Shows the product's one idea — money waits until enough people sign — faster
 * than a paragraph could. Decorative: it holds on the settled state for anyone
 * who has asked for reduced motion, rather than cycling.
 */

const APPROVERS = [
  { name: 'Ada', initials: 'A' },
  { name: 'Ben', initials: 'B' },
];

const STAGES = [
  { label: 'Requested', signed: 0 },
  { label: 'Ada approved', signed: 1 },
  { label: 'Ben approved', signed: 2 },
  { label: 'Paid', signed: 2 },
] as const;

export function ApprovalDemo() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStage(STAGES.length - 1);
      return;
    }
    // Linger on the settled state — that is the one worth reading — and move
    // briskly through the approvals.
    const hold = stage === STAGES.length - 1 ? 3200 : 1600;
    const timer = setTimeout(() => setStage((s) => (s + 1) % STAGES.length), hold);
    return () => clearTimeout(timer);
  }, [stage]);

  const settled = stage === STAGES.length - 1;
  const current = STAGES[stage];

  return (
    <div className="shimmer relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Grants
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            2,400.00 <span className="text-base font-medium text-neutral-500">USDC</span>
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">Acme Design Co.</p>
        </div>

        <span
          className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors duration-500 ${
            settled
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-amber-50 text-amber-800 ring-amber-200'
          }`}
        >
          {settled ? 'Paid' : 'Awaiting approval'}
        </span>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{current.label}</span>
          <span className="tabular-nums">{current.signed} of 2 signatures</span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              settled ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${(current.signed / 2) * 100}%` }}
          />
        </div>

        <div className="mt-5 flex items-center gap-2">
          {APPROVERS.map((a, i) => {
            const hasSigned = current.signed > i;
            return (
              <div key={a.name} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                    hasSigned
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-400 ring-1 ring-inset ring-neutral-200'
                  }`}
                >
                  {hasSigned ? '✓' : a.initials}
                </div>
                <span
                  className={`text-xs transition-colors duration-500 ${
                    hasSigned ? 'text-neutral-900' : 'text-neutral-400'
                  }`}
                >
                  {a.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-neutral-100 pt-4">
        <p
          className={`font-mono text-xs transition-opacity duration-500 ${
            settled ? 'text-indigo-600 opacity-100' : 'text-neutral-300 opacity-60'
          }`}
        >
          {settled ? '0x68b7…b446d3 · confirmed on Base' : 'no transaction yet'}
        </p>
      </div>
    </div>
  );
}
