'use client';

import { useState } from 'react';
import { getAccessToken } from '@privy-io/react-auth';

/**
 * Opens an invoice in a new tab.
 *
 * Invoices are behind an authenticated route, and a plain link cannot carry a
 * bearer token — so fetch the file, hand the browser a blob URL, and open that.
 * The window is opened synchronously on click, before the await, or popup
 * blockers treat it as unsolicited.
 */
export function InvoiceLink({ id, filename }: { id: string; filename: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setError(null);
    setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/invoices/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not load this invoice');

      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;

      // Give the tab time to load before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        onClick={open}
        disabled={busy}
        className="text-indigo-600 hover:underline disabled:opacity-50"
      >
        📎 {filename}
        {busy && <span className="ml-2 text-xs text-neutral-400">opening…</span>}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
