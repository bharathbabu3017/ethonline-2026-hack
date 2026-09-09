'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { activeChain } from '@/lib/chain';

/**
 * Privy configured for PayGate.
 *
 * `defaultChain` and `supportedChains` matter more than they look: members'
 * embedded wallets are the payee addresses for internal payments, and without
 * these they would initialize on Ethereum mainnet.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-lg font-semibold text-red-600">
          NEXT_PUBLIC_PRIVY_APP_ID is not set
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Copy <code className="rounded bg-neutral-100 px-1">.env.example</code> to{' '}
          <code className="rounded bg-neutral-100 px-1">.env.local</code> and fill it in,
          then restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        defaultChain: activeChain.chain,
        supportedChains: [activeChain.chain],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        appearance: { theme: 'light', accentColor: '#4f46e5' },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
