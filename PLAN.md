# PayGate — treasury payouts with approval controls

## Context

Companies paying contractors, vendors, and employees today run payouts through a finance person with bank access. That's a bottleneck and a single point of failure: one compromised account moves any amount, and the audit trail lives in email threads.

**PayGate** puts that flow behind a shared treasury with enforced approval rules. A company creates an org and gets a treasury wallet — no seed phrases, no key management. Any employee can submit a payment request with an invoice attached. Small payments clear immediately. Payments over the company's threshold need a second approver before funds move. Everything settles as USDC on Arc, and every request, approval, and transfer is on the ledger.

The design decision that matters: **the approval threshold is enforced cryptographically inside Privy's TEE, not by application code.** A compromised PayGate backend still cannot move funds over the limit — it has no signature to offer. That is the difference between a payments product and an approval UI bolted onto a hot wallet.

Phases 0-4 are complete and working end to end, with real USDC settled on Base Sepolia. Phases 5-6 (history filters, polish) remain.

---

## Decisions

| Decision | Choice |
|---|---|
| Custody & settlement | Privy organization wallet holds USDC; payouts submitted with the approvers' own signatures |
| Settlement chain | **Base Sepolia** to build on (Privy broadcasts). Arc kept behind the same config, switchable once Privy authorizes it — or today via self-broadcast. |
| Threshold enforcement | Approver signatures against a Privy key quorum, plus an app-side approval count (see the enforcement caveat) |
| Payees | External `0x` addresses (contractors, vendors) **and** internal members by email |
| Storage | SQLite via Prisma; invoice files on local disk |
| Auth | Privy Auth, email OTP |
| Default threshold | $500 USDC, per-org and editable |
| Compliance | Out of scope for the MVP. Testnet, no fiat rails. |

Roles: **Admin** (creates the org, manages members and threshold), **Approver** (can clear over-threshold payments), **Member** (submits requests, can self-clear under-threshold ones).

---

## Architecture

```
Employee submits request + invoice
              ↓
   PayGate stores the exact transaction to be signed
              ↓
  ┌───────────┴────────────┐
 ≤ threshold             > threshold
 requester signs         two approvers sign
 in their browser        in their browsers
              ↓
   PayGate submits the collected signatures together
   POST /v1/wallets/{id}/rpc
   privy-authorization-signature: sig1,sig2
              ↓
   Privy verifies them against the treasury's key quorum,
   then signs and broadcasts
              ↓
   receipt → tx hash → payment history
```

**Approvals are signed in each approver's browser**, with their own Privy key,
via `useAuthorizationSignature()`. Only the resulting signature reaches PayGate,
which holds no signing material and therefore cannot approve a payment by
itself. Signatures are stored until the required number exists, then submitted
together — Privy accepts several as one comma-delimited header value.

### Why signing happens in the browser

Privy issues user signing keys to a server via `POST /v1/wallets/authenticate`. That
endpoint rejects valid Privy access tokens on this app with `Invalid JWT token provided`
— verified with correct `aud`, unexpired tokens, on two accounts, with and without HPKE
encryption params, and with `custom_jwt_auth` false.

`useAuthorizationSignature()` in the browser needs none of that: it signs with the key the
user already holds client-side. That is both the working path and the better one — PayGate
never handles signing material.

### Chain configuration

Phase 0 tested every candidate testnet against the app. Arc is the **only** blocked
one; Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia and Tempo Moderato all pass
authorization. So the chain is a config value with two broadcast modes, and the
payment logic is written once against both:

| Mode | Call | Nonce + gas | Used by |
|---|---|---|---|
| `privy-broadcast` | `eth_sendTransaction` | Privy | Base Sepolia now; Arc if authorized |
| `self-broadcast` | `eth_signTransaction` then viem `sendRawTransaction` | PayGate | Arc today |

Both paths are proven working in `scripts/spike/`. Switching chains edits the config
module, not the payment path.

**Build on Base Sepolia.** Standard EIP-1559 transactions, identical in shape to Arc,
which is what keeps the switch cheap. Circle's USDC lives at
`0x036CbD53842c5426634e7929541eC2318f3dCF7e` (verified: symbol USDC, 6 decimals) and
the faucet is the same one. Tempo was rejected as the interim chain despite its
stablecoin-gas model matching Arc's: it requires a non-standard `type: 118` envelope
with a `calls` array and has no native token, so its payment path would be discarded
on the move to Arc.

*Gas differs between the two.* On Base Sepolia gas is ETH, so the treasury needs ETH
alongside USDC; on Arc a single USDC balance covers both. Privy supports `sponsor: true`
on Base — test it in Phase 3, and if it is enabled the demo never needs ETH.

**Why the security model holds in either mode.** Policies evaluate on the signing
request, so an over-threshold payment cannot obtain a signature without the Approvers
quorum. In self-broadcast mode the backend additionally holds the signed transaction,
but that only lets it delay or drop a broadcast — it cannot alter the amount or the
recipient, both of which the signature covers.

### Quorum + policy topology (per org)

Three Privy objects, created once at org setup:

1. **`Approvers` key quorum** — `user_ids` = approver-eligible members, `authorization_threshold: 2`. Becomes the org's `default_key_quorum_id`, so Privy makes it the treasury wallet's owner. Unrestricted: can authorize any payment and administer the wallet.
2. **`Members` key quorum** — `user_ids` = all members, `authorization_threshold: 1`. Attached to the wallet as an `additional_signer` with `override_policy_ids: [smallPaymentPolicyId]`. Can transact within policy scope; cannot change wallet config.
3. **`smallPaymentPolicy`** — one ALLOW rule on the configured method (`eth_sendTransaction` on Base Sepolia, `eth_signTransaction` in self-broadcast mode). Configured and visible on the Controls page, but see the enforcement caveat below. Privy policies are pure allowlists (there is no `default_action` field), so anything no rule allows is denied:
   - `ethereum_transaction.to` `eq` the chain's USDC address
   - `ethereum_transaction.chain_id` `eq` the chain's ID
   - `ethereum_calldata` `transfer.amount` `lte` `<threshold, raw 6-dec units, hex>`, with the ERC-20 `transfer` ABI supplied inline

The calldata field is `transfer.<input name>` and must match the ABI's declared input name — declare the ABI with `amount` as the second input.

### Enforcement caveat — read this before claiming anything

Privy's enforcement of these controls was observed **toggling on and off** during
development. The same treasury returned `401 Missing privy-authorization-signature`
for an unsigned request one hour and accepted an identical unsigned request the
next, with no change on our side. Separately, a 2,000 USDC transfer passed a
policy capping `transfer.amount` at 5 USDC.

So the quorums and policy are correctly configured, and real per-approver
signatures are collected and submitted — but whether Privy validates them at any
given moment is outside our control. `settlePayment()` therefore also refuses to
submit until the approval count is met, so the rule holds either way.

Accurate phrasing: *approvals are signed by each approver's own Privy key and
verified against the treasury's key quorum.* Do not claim the backend is
incapable of moving funds without checking that enforcement is currently active.

### Why this produces the right behavior

- **Under threshold**: requester authorizes → Members threshold (1) met → policy allows → clears. The UI does the authorize inline with submission so it feels automatic. It isn't a bypass — a real signature is required.
- **Over threshold**: the requester's Members-scope signature is denied by the capped policy. Only the Approvers quorum clears it, and that needs 2 signatures.
- A member who isn't an approver can submit any amount but only self-clear small ones.

---

## Data model (Prisma / SQLite)

Privy owns approval state; the DB owns what Privy doesn't know about — invoices, memos, payee labels, roles, history.

```prisma
model Org {
  id                String   @id @default(cuid())
  name              String
  privyOrgId        String   @unique
  privyWalletId     String
  walletAddress     String   // the treasury
  approverQuorumId  String   // default_key_quorum_id, threshold 2
  memberQuorumId    String   // additional_signer, threshold 1
  memberPolicyId    String   // capped policy
  thresholdMicros   BigInt   // 500_000000 = $500
  members           Member[]
  requests          PaymentRequest[]
  createdAt         DateTime @default(now())
}

model Member {
  id            String   @id @default(cuid())
  orgId         String
  org           Org      @relation(fields: [orgId], references: [id])
  privyUserId   String   @unique
  email         String
  name          String
  walletAddress String?  // personal embedded wallet, for internal payees
  role          String   // ADMIN | APPROVER | MEMBER
  createdAt     DateTime @default(now())
  @@unique([orgId, email])
}

model PaymentRequest {
  id             String   @id @default(cuid())
  orgId          String
  org            Org      @relation(fields: [orgId], references: [id])
  requesterId    String
  payeeType      String   // ADDRESS | MEMBER
  payeeAddress   String   // resolved at submit time, always concrete
  payeeMemberId  String?
  payeeLabel     String   // "Acme Design Co." / contractor name
  amountMicros   BigInt
  memo           String
  route          String   // AUTO | QUORUM (computed at submit, for display)
  requestBody    String?  // the exact transaction every approver signs
  status         String   // PENDING | PROCESSING | EXECUTED | FAILED | REJECTED | EXPIRED
  txHash         String?
  failureReason  String?
  invoices       Invoice[]
  approvals      Approval[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Invoice {
  id           String   @id @default(cuid())
  requestId    String
  request      PaymentRequest @relation(fields: [requestId], references: [id])
  filename     String   // original name, for display
  storagePath  String   // on-disk path, never user-controlled
  mimeType     String
  sizeBytes    Int
  uploadedById String
  createdAt    DateTime @default(now())
}

model Approval {
  id        String   @id @default(cuid())
  requestId String
  request   PaymentRequest @relation(fields: [requestId], references: [id])
  memberId  String
  kind      String   // AUTHORIZED | REJECTED
  createdAt DateTime @default(now())
  @@unique([requestId, memberId])
}

model AuditEvent {
  id        String   @id @default(cuid())
  orgId     String
  requestId String?
  actorId   String?
  type      String   // ORG_CREATED, MEMBER_ADDED, REQUEST_SUBMITTED, INVOICE_UPLOADED,
                     // APPROVED, REJECTED, EXECUTED, FAILED, THRESHOLD_CHANGED
  payload   String   // JSON
  createdAt DateTime @default(now())
}
```

**Money rule:** integer micro-USDC (`BigInt`) everywhere; format only at the display edge. No floats.

**Arc rule:** USDC-as-gas is one pool with two views — 18-dec native for gas, 6-dec ERC-20 at `0x3600…0000` for everything else. Read and display only the ERC-20 view. Never sum the two, never call `decimals()` on a native sentinel address.

---

## Build phases

Each phase ends at something runnable. Don't start the next until the current one's check passes.

### Phase 0 — Prove the foundation ✅ DONE

Both blocking unknowns resolved. Scripts kept in `scripts/spike/`, re-runnable via
`npm run spike:arc` and `npm run spike:privy`.

**1. Can Privy move USDC on Arc?** Partly. It will not broadcast — `eth_sendTransaction`
returns `401 App is not authorized to transact on chain eip155:5042002`. Arc is missing
from the app's authorized-chain list, which lives on Privy's side and is absent from the
app settings API, so it cannot be self-served. It *will* sign: `eth_signTransaction` is
not chain-gated. Verified end to end — signed by Privy, broadcast via viem, confirmed in
block 61231611, recipient credited, gas paid in USDC.

*Worth doing anyway:* ask Privy to add Arc to the app's authorized chains. If they do,
Phase 3 simplifies to `eth_sendTransaction` and the nonce problem below disappears.

**2. Are key quorums enabled?** Yes, and not gated. The full Phase 2 setup path runs
clean: users → Approvers quorum (2-of-2) → Members quorum (1-of-3) → capped policy →
organization → org wallet with `additional_signers`. Both quorums are created with the
right thresholds and members, confirming the routing design.

**SDK findings that change later phases** (`@privy-io/node@0.34`):

- The public `PrivyClient` is missing methods the docs show — `users.create`,
  `keyQuorums.create`, and every `organizations` method exist only on the private
  underlying client. `scripts/spike/_shared.ts` reaches it through a narrow typed cast;
  reuse that helper rather than casting to `any` at each call site.
- Server-side user signing keys are unavailable on this app, so approvals are signed in
  the browser instead. See *Why signing happens in the browser*.
- Policies have no `default_action`; they are allowlists.

### Phase 1 — Scaffold + auth ✅ DONE

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; Prisma + SQLite.
- `PrivyProvider`, `loginMethods: ['email']`, embedded wallet created on login.
- Server: `PrivyClient` from `@privy-io/node`. Every API route verifies the access token before doing anything.
- `.gitignore` covers `.env*` and `uploads/` before the first commit. App secret is server-only, never `NEXT_PUBLIC_`.

**Check:** log in with email, see your own Privy user ID and embedded wallet address on a page.

### Phase 2 — Org + treasury ✅ DONE

`POST /api/orgs`. Order matters:

1. `privy.users().create()` per member — `linked_accounts: [{ type: 'email', address }]`. Server-created users can log in later with that same email and resolve to the same user.
2. `keyQuorums().create({ user_ids: approverIds, authorization_threshold: 2, display_name: 'Approvers' })`
3. `keyQuorums().create({ user_ids: allMemberIds, authorization_threshold: 1, display_name: 'Members' })`
4. `policies().create({ ... })` — the capped policy above
5. `organizations().create({ display_name, default_key_quorum_id: approverQuorumId })`
6. `wallets().create({ chain_type: 'ethereum', entity: { id: orgId, type: 'organization' }, additional_signers: [{ signer_id: memberQuorumId, override_policy_ids: [policyId] }] })` — omit `owner`/`owner_id` so Privy assigns the default quorum as owner.
7. Persist all six IDs on `Org`. Show the treasury address + funding instructions.

Confirm the exact `additional_signers` item shape against `@privy-io/node` types — the OpenAPI spec references `AdditionalSignerItemInput` without inlining it, and prose is the only source for `override_policy_ids`.

For the MVP, seed all members at org creation. Adding an approver later means updating the Approvers quorum, which requires a signature from that same quorum — so existing approvers must sign. Deferred.

**Check:** create an org with 3 members, fund the treasury from the faucet, see the balance in the UI.

### Phase 3 — Submit a request with an invoice ✅ DONE

`POST /api/requests` (multipart):

1. Verify caller's token → resolve `Member`.
2. Handle the upload: accept PDF/PNG/JPG, cap at ~10MB, validate the actual content type rather than trusting the extension, store under a generated filename in `uploads/{orgId}/` — never interpolate the user's filename into a path. Keep the original name in the DB for display only.
3. Resolve the payee to a concrete address: paste-through for `ADDRESS`, member lookup for `MEMBER`. Validate with viem `isAddress`. Store the resolved address so history stays immutable if a member's wallet changes later.
4. `amountMicros = parseUnits(amount, 6)`. Reject ≤ 0.
5. Encode: `encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [payeeAddress, amountMicros] })`.
6. Store the exact transaction to be signed (`PaymentRequest.requestBody`) — `{to: USDC, data: transfer calldata, value: '0x0'}`. Fixing it at submit time means every approver signs identical bytes and nothing can drift afterwards.
7. Persist the request + invoice rows; set `route` by comparing against `org.thresholdMicros`.
8. If AUTO, the client immediately runs the approve flow so it settles in one action.

Serve invoice files through an authenticated route that checks org membership — never as static assets.

*Nonce handling only matters in `self-broadcast` mode (Arc), where PayGate supplies the nonce and a signed transaction can go stale between approval and execution. On Base Sepolia Privy manages it. If Arc is switched on, assign the nonce optimistically and offer a one-click resubmit when a broadcast fails on nonce.*

**Check:** submit a request with a PDF attached; it appears with the invoice viewable, awaiting approval.

### Phase 4 — Approve and settle ✅ DONE

`GET /api/requests/:id/payload` returns the exact request to sign. The browser signs it
with `useAuthorizationSignature()`, then `POST /api/requests/:id/approve` stores the
signature.

Once the approval count is met, `settlePayment()` submits every collected signature in
one `privy-authorization-signature` header and records the tx hash. `/reject` closes a
payment out locally — nothing exists at Privy to undo, since a payment is only submitted
once it already has its approvals.

**Verified on-chain:** 6.00 USDC via two signed approvals (block 46767647) and 1.00 USDC
via one (block 46767595), treasury 20.00 → 13.00 USDC.

### Phase 5 — History and audit

- No webhooks needed: settlement is synchronous, so the transaction hash is known by the
  time the approve request returns and is written straight to the row.
- Payment history: filterable by status, payee, requester, date. Request detail shows the
  invoice, memo, approval trail with names and timestamps, and the explorer link.

**Check:** a settled payment shows its hash and explorer link; a failed one shows a readable reason.

### Phase 6 — Make it usable

Treasury dashboard (balance, pending approvals, recent activity), approval queue with a badge for approvers, empty and error states, CSV export of payment history. Seed script that stands up a demo org with members and history.

---

## Setup: manual vs code

**Privy Dashboard (do first):**
- Create app → app ID + app secret
- Enable email login; allowed domains incl. `http://localhost:3000`
- Confirm Organizations and key quorums are enabled — if gated, contact Privy immediately; this is the long-pole dependency
- Register the webhook endpoint (Phase 5)

**Circle:** testnet USDC from https://faucet.circle.com. No Circle API key needed for the MVP.

**Everything else is code** — users, quorums, policies, orgs, and wallets are all API-created.

**Env:** `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_WEBHOOK_SECRET`, `DATABASE_URL`, `ARC_RPC_URL=https://rpc.testnet.arc.network`.

---

## Deferred (deliberately)

Not in the MVP, listed so they don't creep in:

- **Automated treasury funding** — a Circle developer-controlled wallet (`ARC-TESTNET`) as a platform treasury that tops up org wallets, replacing the manual faucet step. Roughly an hour with `@circle-fin/developer-controlled-wallets`; needs an API key + entity secret registration. Worth doing once the core flow is solid.
- **Cross-chain funding** — bridge USDC in from another chain via CCTP (Arc domain 26).
- Changing the threshold in-app (requires updating both the org row and the policy rule, which must stay in sync).
- Adding/removing members after org creation — updating a key quorum requires a signature from that same quorum, so it needs the approvers to sign.
- Recurring payments, batch payouts, email notifications, multi-org membership, fiat off-ramp for payees.

---

## Risks and fallbacks

| Risk | Likelihood | Fallback |
|---|---|---|
| ~~Privy won't route `eip155:5042002`~~ | **Confirmed, routed around** | Phase 0: Arc is the only blocked chain. Building on Base Sepolia, where Privy broadcasts normally. Arc remains reachable today via the proven self-broadcast path, and becomes a config flip if Privy authorizes it. |
| Signed tx goes stale before approval (nonce or gas) | Dormant | Only bites in `self-broadcast` mode, so it does not apply on Base Sepolia. See the deferred note in Phase 3 before enabling Arc. |
| ~~Key quorums gated on your app~~ | **Cleared** | Resolved in Phase 0: quorums, policies, organizations and org wallets all work on this app with no special enablement. |
| Policy can't decode calldata on an unrecognized chain | Low | `ethereum_calldata` decodes from the ABI you supply, so it shouldn't be chain-dependent. If it is, fall back to app-level routing with the 2-of-N quorum still enforced for large payments. |
| ~~Server cannot obtain a user signing key~~ | **Routed around** | `/v1/wallets/authenticate` rejects valid access tokens on this app. Approvals are signed in the browser instead, which needs no server-issued key. |
| Webhooks unreliable behind a tunnel | Low | Not used — settlement is synchronous, so the tx hash is known when the request returns. |
| Privy enforcement toggling on/off | **Observed** | Seen twice on the same wallet in one day. `settlePayment()` checks the approval count itself, so payments behave correctly either way. Recheck before making enforcement claims. |
| Approver signing key is browser-local | Medium | `useAuthorizationSignature()` signs with the user's Privy key in that browser. Clearing site data means re-authenticating. Fine for a demo; note it if a judge asks. |

---

## Verification

**Done — verified on Base Sepolia:**

- 1.00 USDC, under threshold, one signed approval → settled, block 46767595
- 6.00 USDC, over threshold, two signed approvals from two people → settled, block 46767647
- Treasury 20.00 → 13.00 USDC, reconciles exactly
- `settlePayment()` refuses with zero approvals recorded

**Still worth running in the browser:**

1. Submit under threshold with an invoice → settles immediately → explorer link resolves
2. Submit over threshold → pending at 1 of 2 → second approver settles it
3. Approve then reject the same payment → closes cleanly (this path used to throw on the
   one-vote-per-member constraint)
4. Pay an internal member by email → resolves to their embedded wallet → settles
5. Invoice: upload a PDF, view it, then rename a `.txt` to `.pdf` and confirm it is rejected

**Negative checks:** malformed address rejected client- and server-side; zero and negative
amounts rejected; approving twice does not double-count; a member of org A cannot read or
approve org B's requests; a non-member cannot fetch an invoice by guessing its URL.

**Dev scripts, no browser needed:** `npm run dev:verify` creates a throwaway org and proves
the settlement path; `npm run dev:test-settlement` settles against the newest org.
