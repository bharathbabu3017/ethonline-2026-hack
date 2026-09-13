# PayGate

**Business payouts with approvals built in.** A shared company treasury where every payment
carries a rule — who can approve it, how many of them, and up to what amount.

**Live demo → [usepaygate.xyz](https://usepaygate.xyz)**

Built on [Privy](https://privy.io) organization wallets, key quorums and policies. Settles in
USDC, EURC, WETH and ETH on Base Sepolia.

## Demo

A full walkthrough of every flow — organization setup, approval groups, submitting a payment with
an invoice, single-signature and two-approver settlement, treasury administration, and the audit
trail.

[![PayGate demo — full walkthrough](https://img.youtube.com/vi/EPf3Y5yPvyY/maxresdefault.jpg)](https://youtu.be/EPf3Y5yPvyY)

<p align="center"><a href="https://youtu.be/EPf3Y5yPvyY"><strong>▶ Watch the full demo</strong></a></p>

---

## The problem

Companies paying contractors, vendors and staff route everything through one person with bank
access. That's a bottleneck and a single point of failure: one compromised account can move any
amount, and the approval trail lives in email threads.

PayGate puts that flow behind a shared treasury with enforced approval rules. Anyone on the team
can raise a payment with an invoice attached. Small payments clear on one signature. Larger ones
wait for a second approver. Every step is recorded.

---

## How Privy enables this

Privy isn't an add-on here — it's the part that makes the product meaningful. Without it you'd
have a database table that *claims* two people approved something.

| Privy capability | What it does in PayGate |
|---|---|
| **Organization wallets** | Each company gets one treasury wallet, owned by the org rather than a person. Its private key lives in Privy's secure enclave — not in our database, not in a browser, not exportable. |
| **Key quorums** | Every approval group is an *m*-of-*n* quorum. "Grants: 2 of the 4-person committee" is a real Privy object, not application state. |
| **Policies** | Each group carries its own spending policy — asset, chain and amount limits. Privy evaluates only the policy of whichever signer authorizes a transaction. |
| **Scoped additional signers** | Groups attach to the treasury as additional signers with `override_policy_ids`, so one wallet enforces different limits for payroll, grants and vendors. |
| **Embedded wallets** | Members sign in with an email and get a self-custodial wallet. No seed phrases, and teammates can be paid at their own address. |
| **Authorization signatures** | Approvals are signed **in the approver's browser** with their own Privy key via `useAuthorizationSignature()`. PayGate only relays the signature. |

**PayGate never holds signing material.** Even fully compromised, the backend has no key to sign
with — it can relay signatures, not manufacture them.

### Two Privy behaviours worth knowing

These were found while building and are documented honestly rather than glossed over:

- **Privy's server-side user-key endpoint is unavailable on this app.** `POST /v1/wallets/authenticate`
  rejects valid Privy access tokens with `Invalid JWT token provided`, so approvals cannot be
  signed server-side. Signing happens in the browser instead, which needs no server-issued key —
  and is the stronger design anyway.
- **Arc is not authorized for this app.** `eth_sendTransaction` with `caip2: eip155:5042002`
  returns `401 App is not authorized to transact on chain`. Privy *will* sign for Arc, so
  [`src/lib/chain.ts`](src/lib/chain.ts) carries a `self-broadcast` mode that signs with Privy and
  broadcasts via viem — verified working on Arc. Base Sepolia is the default because Privy
  broadcasts there directly.

---

## Features

**Approval groups** — Named rules, each its own quorum and policy. Set approvals required, a
per-payment limit, which assets it may release, and who's in it. Payments route to the cheapest
rule that permits them, or you pick explicitly.

**Multi-asset treasury** — USDC, EURC, WETH and native ETH from one wallet, with per-asset
balances and limits. Native and ERC-20 transfers are different transactions with different policy
rules; both are handled.

**Payment requests** — Payee (external address or a teammate by name), amount, asset,
description, invoice. Before submitting you see which rule will govern it and who must approve.

**Approvals** — Only members of the governing group can approve or reject. A requester can always
withdraw their own request. Approving signs the transaction; it's what releases the money.

**Wallet administration** — Attaching a group to the treasury is an owner-level action at Privy,
so it needs the same approvals as a large payment. Changing who may spend is as sensitive as
spending.

**Audit activity** — Every request, approval, rejection and settlement with who acted and when,
plus a link to the on-chain transaction. Filterable, exportable to CSV with approvers included.

---

## Running it locally

### Prerequisites

- Node 20+
- A [Privy app](https://dashboard.privy.io) — app ID and app secret
- A Postgres database (Neon, Supabase, or local)

### Setup

```bash
git clone <this repo>
cd paygate
npm install

cp .env.example .env.local   # then fill it in
npx prisma db push           # create the schema
npm run dev
```

`.env.local`:

```bash
PRIVY_APP_ID=              # from dashboard.privy.io
NEXT_PUBLIC_PRIVY_APP_ID=  # same value; the browser needs it
PRIVY_APP_SECRET=          # server-only, never NEXT_PUBLIC_
DATABASE_URL=              # postgresql://...
NEXT_PUBLIC_CHAIN=base-sepolia
```

### Privy dashboard

Add `http://localhost:3000` to **Allowed origins** *and* to the **Default web app client**
allowed origins. Sign-in fails from unregistered origins.

### First run

1. Sign in with email → create an organization (name, threshold, teammates)
2. Copy the treasury address from the dashboard
3. Fund it with **USDC** ([faucet.circle.com](https://faucet.circle.com)) **and a little ETH for
   gas** ([Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)) — a funded treasury
   with no gas fails at settlement
4. Submit a payment under the threshold — it settles on your signature
5. Submit one above it — a second approver must sign

---

## Architecture

```
Employee submits request + invoice
              ↓
   PayGate stores the exact transaction to be signed
              ↓
   Routed to an approval group — the rule that covers it
              ↓
   Each approver signs in their browser with their own Privy key
              ↓
   Signatures submitted together to Privy
   POST /v1/wallets/{id}/rpc
   privy-authorization-signature: sig1,sig2
              ↓
   Privy verifies against the treasury's key quorum, signs, broadcasts
              ↓
   receipt → tx hash → audit trail
```

### Layout

```
src/lib/chain.ts            Chain + token registry; swap networks here
src/lib/org-setup.ts        Creates users, quorums, policy, org, treasury
src/lib/approval-groups.ts  Groups as quorums + per-asset policies
src/lib/wallet-changes.ts   Owner-level treasury changes
src/lib/settlement.ts       Submits collected signatures, records the result
src/lib/use-approve.ts      Browser-side signing
src/app/api/               Auth-guarded routes; every one verifies the token
```

### Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 + Postgres · viem 2 ·
`@privy-io/react-auth` 3 · `@privy-io/node` 0.34

### Scripts

```bash
npm run dev                  # local dev
npm run typecheck            # tsc --noEmit
npm run db:push              # apply schema
npm run spike:privy          # verify Privy primitives work on your app
npm run spike:arc            # verify Arc signing + broadcast
npm run dev:verify           # create a throwaway org and settle a payment
```

---

## Honest notes

**Privy's enforcement of controls was observed toggling on and off** during development — the same
treasury returned `401 Missing privy-authorization-signature` for an unsigned request one hour and
accepted an identical one the next, with no change on our side. The quorums and policies are
correctly configured and real signatures are collected and submitted, but whether Privy validates
them at any given moment is outside our control. `settlePayment()` therefore also refuses to submit
until the required approvals are recorded, so the rule holds either way.

**Groups show how they are enforced.** A group reads *"Privy — signer on the treasury"* once its
attachment has been approved, and *"PayGate — attachment pending"* before that. The label is
accurate rather than aspirational.

**Testnet only.** Base Sepolia, with test tokens. Nothing here has handled real money.

**Approver keys are browser-local.** `useAuthorizationSignature()` signs with the user's Privy key
in that browser. Clearing site data means re-authenticating.

---

## Licence

MIT
