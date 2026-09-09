---
name: Privy
description: Use when building wallet infrastructure, authentication systems, or financial applications. Reach for Privy when you need to create embedded wallets, authenticate users, manage wallet controls and policies, execute transactions, or integrate funding/payment flows. Use for consumer apps, trading platforms, treasury management, AI agents, and fintech products.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is a programmable wallet infrastructure platform for building financial applications. It provides embedded wallets (created and managed by Privy), authentication (email, social, passkeys, wallets), transaction execution across 50+ blockchains, and policy controls for authorization and spending limits. Use Privy's client-side SDKs (React, React Native, Swift, Android, Flutter, Unity) for frontend integration, server-side SDKs (Node.js, Java, Go, Rust, Ruby) for backend operations, or REST API for direct HTTP requests. Key files: `PrivyProvider` config in React, app ID and app secret from the Privy Dashboard, API endpoints at `https://api.privy.io/v1/`. Primary docs: https://docs.privy.io

## When to use

Reach for Privy when:
- Building embedded wallets for users, organizations, or AI agents
- Authenticating users with email, SMS, social login, passkeys, or external wallets
- Creating non-custodial or custodial wallets with flexible ownership models
- Executing transactions on Ethereum, Solana, Tempo, Bitcoin, or other blockchains
- Implementing spending policies, transaction limits, or approval workflows
- Managing multi-sig wallets or key quorum approvals
- Building payment flows, onramps, or yield integrations
- Requiring server-side wallet automation with scoped permissions
- Integrating with existing authentication systems via JWT

Do not use Privy for: standalone key management without wallet functionality, or applications that don't need blockchain interaction.

## Quick reference

### SDKs and platforms

| Platform | Package | Best for |
|----------|---------|----------|
| React | `@privy-io/react-auth` | Web apps, Next.js, SPA |
| React Native | `@privy-io/react-native-auth` | Expo apps, mobile |
| Node.js | `@privy-io/node` | Backend, server operations |
| Swift | `@privy-io/privy-swift` | iOS apps |
| Android | `@privy-io/privy-android` | Android apps |
| Java | `@privy-io/privy-java` | JVM backends |
| Go | `@privy-io/privy-go` | Go services |
| REST API | HTTP requests | Language-agnostic, direct API calls |

### Core API endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create wallet | `POST /api/v1/wallets` | POST |
| Get wallet | `GET /api/v1/wallets/{wallet_id}` | GET |
| Send transaction (Ethereum) | `POST /api/v1/wallets/{wallet_id}/ethereum/eth_sendTransaction` | POST |
| Send transaction (Solana) | `POST /api/v1/wallets/{wallet_id}/solana/signAndSendTransaction` | POST |
| Create policy | `POST /api/v1/policies` | POST |
| Get user | `GET /api/v1/users/{user_id}` | GET |
| Create user | `POST /api/v1/users` | POST |

### Authentication headers (REST API)

```
Authorization: Basic <base64(app_id:app_secret)>
privy-app-id: <your-app-id>
Content-Type: application/json
```

### Wallet ownership models

| Model | Owner | Use case |
|-------|-------|----------|
| User-owned | User ID | Self-custodial consumer wallets |
| User + server | User ID + authorization key | Automated trading, limit orders |
| Application-owned | Authorization key | Treasury, bots, agent wallets |
| Custodial | Licensed custodian | Institutional, FBO accounts |

### Common wallet actions

| Action | Ethereum | Solana |
|--------|----------|--------|
| Send transaction | `eth_sendTransaction` | `signAndSendTransaction` |
| Sign message | `personal_sign` | `signMessage` |
| Sign typed data | `eth_signTypedData_v4` | N/A |
| Switch chain | `wallet_switchEthereumChain` | N/A |

## Decision guidance

### When to use client-side vs server-side SDKs

| Scenario | Use |
|----------|-----|
| User authentication, wallet creation, signing | Client-side SDK (React, React Native, Swift, Android) |
| Batch wallet creation, server automation, policy management | Server-side SDK (Node.js, Java, Go) |
| Microservice integration, language-agnostic | REST API |
| User-initiated transactions with user approval | Client-side SDK |
| Automated server-side transactions (with user key) | Server-side SDK + user authorization signature |

### When to use embedded vs external wallets

| Choice | When |
|--------|------|
| Embedded wallets | New users, seamless onboarding, non-custodial control, multi-chain support |
| External wallets (MetaMask, Phantom) | Power users with existing wallets, crypto-native audiences, user-controlled keys |
| Both (connect or create) | Maximum flexibility, let users choose |

### When to use Privy authentication vs JWT-based auth

| Choice | When |
|--------|------|
| Privy authentication | No existing auth system, need multiple login methods, want Privy-managed MFA |
| JWT-based auth | Existing auth provider (Auth0, Firebase, Cognito), want to add wallets to existing system |

## Workflow

### 1. Set up Privy app and credentials
- Create app in Privy Dashboard
- Obtain app ID and app secret
- Create app client for mobile/non-web platforms
- Configure login methods (email, social, passkeys, etc.)
- Set allowed domains and redirect URIs

### 2. Initialize SDK in your application
- **React**: Wrap app with `PrivyProvider`, pass `appId` and `clientId`
- **React Native**: Initialize `PrivyProvider` with app ID and client ID
- **Node.js**: Create Privy client with app ID and app secret
- **REST API**: Store app ID and app secret securely, use in Authorization header

### 3. Authenticate users
- Use `usePrivy()` hook (React) or equivalent to trigger login
- Configure login methods in dashboard
- Verify user is authenticated before accessing wallets
- Check `ready` state before consuming Privy state

### 4. Create or access wallets
- **Client-side**: Use `useCreateWallet()` hook or automatic creation on login
- **Server-side**: Call `wallets().create()` with user ID as owner
- **REST API**: POST to `/api/v1/wallets` with owner and chain type
- Specify wallet owner (user ID, authorization key, or key quorum)

### 5. Execute transactions
- **Ethereum**: Use `eth_sendTransaction` or `eth_signTransaction` + broadcast
- **Solana**: Use `signAndSendTransaction` or `signTransaction` + broadcast
- Populate missing fields (gas, nonce, etc.) automatically
- Handle transaction status via webhooks or polling

### 6. Implement policies and controls
- Create policies via dashboard or API to define spending limits, recipient whitelists, contract interactions
- Assign policies to wallets at creation or update
- Policies evaluated at request time, enforced in secure enclaves
- Use key quorums for multi-sig approval workflows

### 7. Monitor and verify
- Subscribe to webhooks for transaction, wallet, and user events
- Poll wallet actions for status updates
- Verify transaction confirmation on-chain
- Log security events (MFA, key export, authentication)

## Common gotchas

- **HTTPS required**: Embedded wallets only work in secure contexts (https://). Localhost is treated as secure by browsers, but deployed apps must use https://.
- **Privy not ready**: Always check `ready` state from `usePrivy()` before accessing wallet state. Accessing state before ready can return stale data.
- **User owner required for user wallets**: If creating a user wallet, you must specify the user ID as owner. Client-side SDKs do this automatically.
- **Policy evaluation timing**: Policies are evaluated at request time in secure enclaves. They cannot be changed retroactively for pending transactions.
- **Delegated auth security**: If using email, SMS, or social login as primary auth, require MFA (passkey or TOTP) to protect wallet access. Account compromise at the delegated provider exposes wallet funds.
- **API authentication**: REST API requires both `Authorization: Basic` header and `privy-app-id` header. Missing either will be rejected.
- **Idempotency keys**: Use idempotency keys to prevent duplicate wallet creation or transaction submission on retries.
- **Wallet export**: Private key export is a sensitive operation. Require authorization signature and log all exports.
- **Chain-specific signing**: Ethereum uses `eth_signTransaction`, Solana uses `signTransaction`. Don't mix them up.
- **External wallet limitations**: External wallets (MetaMask, Phantom) don't support Privy policies or server-side automation. Use embedded wallets for those features.

## Verification checklist

Before submitting work with Privy:

- [ ] App ID and app secret are stored securely (environment variables, not hardcoded)
- [ ] PrivyProvider wraps the entire app and is initialized with correct appId
- [ ] `ready` state is checked before accessing wallet or user state
- [ ] Wallet owner is correctly specified (user ID for user wallets, authorization key for app-owned)
- [ ] Policies are created and assigned to wallets if spending limits are required
- [ ] Transactions include required fields (wallet ID, chain, recipient, amount)
- [ ] Error handling covers common cases (user not authenticated, wallet not found, insufficient funds, policy rejection)
- [ ] Webhooks are configured for production monitoring (transaction status, wallet events, user events)
- [ ] MFA is enabled for delegated login methods (email, SMS, social)
- [ ] HTTPS is enforced for production deployment
- [ ] Authorization signatures are required for sensitive operations (policy updates, key export)
- [ ] Idempotency keys are used for wallet creation and transaction submission
- [ ] Transaction status is verified (pending, confirmed, failed) before considering it complete

## Resources

- **Comprehensive navigation**: https://docs.privy.io/llms.txt
- **Getting started**: https://docs.privy.io/basics/get-started/about
- **Wallet infrastructure**: https://docs.privy.io/wallets/overview
- **Authentication**: https://docs.privy.io/authentication/overview
- **Controls and policies**: https://docs.privy.io/controls/overview
- **REST API reference**: https://docs.privy.io/api-reference/introduction
- **Security implementation guide**: https://docs.privy.io/security/implementation-guide/security-checklist

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt