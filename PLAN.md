# PayGate — treasury payouts with approval controls

## Context

Companies paying contractors, vendors, and employees today run payouts through a finance person with bank access. That's a bottleneck and a single point of failure: one compromised account moves any amount, and the audit trail lives in email threads.

**PayGate** puts that flow behind a shared treasury with enforced approval rules. A company creates an org and gets a treasury wallet — no seed phrases, no key management. Any employee can submit a payment request with an invoice attached. Small payments clear immediately. Payments over the company's threshold need a second approver before funds move. Everything settles as USDC on Arc, and every request, approval, and transfer is on the ledger.

The design decision that matters: **the approval threshold is enforced cryptographically inside Privy's TEE, not by application code.** A compromised PayGate backend still cannot move funds over the limit — it has no signature to offer. That is the difference between a payments product and an approval UI bolted onto a hot wallet.

Phase 0 is complete and its findings are folded in below. Phases 1-6 remain.

---

## Decisions

| Decision | Choice |
|---|---|
| Custody & settlement | Privy organization wallet holds USDC; payouts go out as RPC intents |
| Settlement chain | **Base Sepolia** to build on (Privy broadcasts). Arc kept behind the same config, switchable once Privy authorizes it — or today via self-broadcast. |
| Threshold enforcement | Privy policy engine (conditional signer policies), not app logic |
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
   POST /v1/intents/wallets/{id}/rpc        (app secret only)
   USDC.transfer calldata on the configured chain
              ↓
   Requester authorizes with their own JWT
              ↓
  ┌───────────┴────────────┐
 ≤ $500                  > $500
 Members quorum          Approvers quorum
 threshold 1             threshold 2
 capped policy           unrestricted
 → clears immediately    → waits for a 2nd approver
              ↓
   privy-broadcast: Privy signs + sends
   self-broadcast:  Privy signs, PayGate sends via viem
              ↓
   receipt → tx hash → payment history
```

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
3. **`smallPaymentPolicy`** — one ALLOW rule on the configured method (`eth_sendTransaction` on Base Sepolia, `eth_signTransaction` in self-broadcast mode). Privy policies are pure allowlists (there is no `default_action` field), so anything no rule allows is denied:
   - `ethereum_transaction.to` `eq` the chain's USDC address
   - `ethereum_transaction.chain_id` `eq` the chain's ID
   - `ethereum_calldata` `transfer.amount` `lte` `<threshold, raw 6-dec units, hex>`, with the ERC-20 `transfer` ABI supplied inline

The calldata field is `transfer.<input name>` and must match the ABI's declared input name — declare the ABI with `amount` as the second input.

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
  privyIntentId  String   @unique
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
organization → org wallet with `additional_signers` → RPC intent. The created intent's
`authorization_details` lists both quorums as eligible authorizers at thresholds 2 and 1,
confirming the routing design.

**SDK findings that change later phases** (`@privy-io/node@0.34`):

- The public `PrivyClient` is missing methods the docs show — `users.create`,
  `keyQuorums.create`, and every `organizations` method exist only on the private
  underlying client. `scripts/spike/_shared.ts` reaches it through a narrow typed cast;
  reuse that helper rather than casting to `any` at each call site.
- **`intents.authorize()` does not exist on either client.** Only the `IntentAuthorizeInput`
  type ships. Approvals must use the exported `generateAuthorizationSignature()` plus a
  raw `POST /v1/intents/:id/authorize`. This was listed as a fallback; it is the only path.
- Policies have no `default_action`; they are allowlists.

### Phase 1 — Scaffold + auth

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; Prisma + SQLite.
- `PrivyProvider`, `loginMethods: ['email']`, embedded wallet created on login.
- Server: `PrivyClient` from `@privy-io/node`. Every API route verifies the access token before doing anything.
- `.gitignore` covers `.env*` and `uploads/` before the first commit. App secret is server-only, never `NEXT_PUBLIC_`.

**Check:** log in with email, see your own Privy user ID and embedded wallet address on a page.

### Phase 2 — Org + treasury

`POST /api/orgs`. Order matters:

1. `privy.users().create()` per member — `linked_accounts: [{ type: 'email', address }]`. Server-created users can log in later with that same email and resolve to the same user.
2. `keyQuorums().create({ user_ids: approverIds, authorization_threshold: 2, display_name: 'Approvers' })`
3. `keyQuorums().create({ user_ids: allMemberIds, authorization_threshold: 1, display_name: 'Members' })`
4. `policies().create({ ... })` — the capped policy above
5. `organizations().create({ display_name, default_key_quorum_id: approverQuorumId })`
6. `wallets().create({ chain_type: 'ethereum', entity: { id: orgId, type: 'organization' }, additional_signers: [{ signer_id: memberQuorumId, override_policy_ids: [policyId] }] })` — omit `owner`/`owner_id` so Privy assigns the default quorum as owner.
7. Persist all six IDs on `Org`. Show the treasury address + funding instructions.

Confirm the exact `additional_signers` item shape against `@privy-io/node` types — the OpenAPI spec references `AdditionalSignerItemInput` without inlining it, and prose is the only source for `override_policy_ids`.

For the MVP, seed all members at org creation. Adding an approver later means updating the Approvers quorum, which is itself an owner-authorized action (an `update_key_quorum` intent needing 2 signatures) — correct, but defer it.

**Check:** create an org with 3 members, fund the treasury from the faucet, see the balance in the UI.

### Phase 3 — Submit a request with an invoice

`POST /api/requests` (multipart):

1. Verify caller's token → resolve `Member`.
2. Handle the upload: accept PDF/PNG/JPG, cap at ~10MB, validate the actual content type rather than trusting the extension, store under a generated filename in `uploads/{orgId}/` — never interpolate the user's filename into a path. Keep the original name in the DB for display only.
3. Resolve the payee to a concrete address: paste-through for `ADDRESS`, member lookup for `MEMBER`. Validate with viem `isAddress`. Store the resolved address so history stays immutable if a member's wallet changes later.
4. `amountMicros = parseUnits(amount, 6)`. Reject ≤ 0.
5. Encode: `encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [payeeAddress, amountMicros] })`.
6. Build the transaction for the configured mode. In `privy-broadcast`, `intents().rpc(walletId, { method: 'eth_sendTransaction', caip2, params: { transaction: { to: USDC, data, value: '0x0' } } })` — Privy fills nonce and gas. In `self-broadcast`, fetch `getTransactionCount`, `estimateFeesPerGas` and `estimateGas` from viem first and pass the full EIP-1559 transaction to `eth_signTransaction`.
7. Persist the request + invoice rows; set `route` by comparing against `org.thresholdMicros`.
8. If AUTO, immediately run the Phase 4 authorize path with the requester's token so it settles in one action.

Serve invoice files through an authenticated route that checks org membership — never as static assets.

Test whether `sponsor: true` works on Base Sepolia. If gas sponsorship is enabled on the app, the treasury needs no ETH at all and funding is USDC-only, matching how Arc will behave.

#### Deferred: nonce staleness (self-broadcast only)

Only applies in `self-broadcast` mode, so it is dormant while building on Base Sepolia.
There, PayGate supplies the nonce and the signature covers it, so the nonce is frozen when
the intent is created — but an over-threshold payment may not be approved for hours, and any
payment broadcast meanwhile consumes that nonce. The pending one then fails *nonce too low*.

Recommended handling when Arc self-broadcast is switched on: assign the nonce optimistically,
and on a nonce failure mark the request `FAILED` with a clear reason plus a one-click resubmit
that creates a fresh intent for approvers to re-sign. Alternatives are serializing to one
in-flight payment per treasury (correct, poor UX) or a strict sequential nonce queue (closest
to how multisigs behave, most code, stalls behind a rejected item).

**Check:** submit a $50 request with a PDF attached; the request appears with the invoice viewable and a pending intent ID.

### Phase 4 — Approve and settle

`POST /api/requests/:id/approve`:

1. Verify the approver's token; confirm org membership; confirm they haven't already approved.
2. Authorize via raw REST — the SDK has no `intents.authorize()`. Build the payload with the exported `formatRequestForAuthorizationSignature()`, sign it with `generateAuthorizationSignature()` using the approver's JWT, then `POST /v1/intents/{id}/authorize` with `{ signature, timestamp }`. One call per approver; the endpoint takes a single signature.
3. Record `Approval` + `AuditEvent`. Privy is idempotent per signer; the unique constraint keeps the UI honest.
4. Re-fetch the intent via `api.intents.get(id)`. In `privy-broadcast` mode `action_result` carries the transaction hash directly. In `self-broadcast` it carries the **signed transaction** instead — broadcast it with `publicClient.sendRawTransaction`, await the receipt, then store the hash.

Privy executes automatically once the threshold is met — there is no separate execute call. `/reject` maps to Privy's reject-intent endpoint.

Expect a **Failed** intent when a member signs an over-threshold request and the policy denies it. Surface that as "needs approver sign-off," not a stack trace. Intents expire after 72h.

**Check:** the full matrix — $50 clears on submit; $2,000 sits pending; one approval isn't enough; two approvals settle it; the requester alone can't clear it.

### Phase 5 — History and audit

- `POST /api/webhooks/privy` for `intent.created | authorized | executed | failed | rejected`. Verify the signature. Update status, store `txHash`, append `AuditEvent`.
- Local webhooks need a dev tunnel. **Build the polling fallback too** — `intents().get(id)` on load. Less elegant, zero dependencies, and it's what keeps the app working when the tunnel drops.
- Payment history: filterable by status, payee, requester, date. Request detail shows the invoice, the memo, the approval trail with names and timestamps, and the arcscan link.

**Check:** kill the webhook tunnel mid-flow; status still converges via polling.

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

**Everything else is code** — users, quorums, policies, orgs, wallets, and intents are all API-created.

**Env:** `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_WEBHOOK_SECRET`, `DATABASE_URL`, `ARC_RPC_URL=https://rpc.testnet.arc.network`.

---

## Deferred (deliberately)

Not in the MVP, listed so they don't creep in:

- **Automated treasury funding** — a Circle developer-controlled wallet (`ARC-TESTNET`) as a platform treasury that tops up org wallets, replacing the manual faucet step. Roughly an hour with `@circle-fin/developer-controlled-wallets`; needs an API key + entity secret registration. Worth doing once the core flow is solid.
- **Cross-chain funding** — bridge USDC in from another chain via CCTP (Arc domain 26).
- Changing the threshold in-app (requires an `update_policy` intent, 2 approvals — correct but not day-one).
- Adding/removing members after org creation (`update_key_quorum` intent).
- Recurring payments, batch payouts, email notifications, multi-org membership, fiat off-ramp for payees.

---

## Risks and fallbacks

| Risk | Likelihood | Fallback |
|---|---|---|
| ~~Privy won't route `eip155:5042002`~~ | **Confirmed, routed around** | Phase 0: Arc is the only blocked chain. Building on Base Sepolia, where Privy broadcasts normally. Arc remains reachable today via the proven self-broadcast path, and becomes a config flip if Privy authorizes it. |
| Signed tx goes stale before approval (nonce or gas) | Dormant | Only bites in `self-broadcast` mode, so it does not apply on Base Sepolia. See the deferred note in Phase 3 before enabling Arc. |
| ~~Key quorums gated on your app~~ | **Cleared** | Resolved in Phase 0: quorums, policies, organizations and org wallets all work on this app with no special enablement. |
| Policy can't decode calldata on an unrecognized chain | Low | `ethereum_calldata` decodes from the ABI you supply, so it shouldn't be chain-dependent. If it is, fall back to app-level routing with the 2-of-N quorum still enforced for large payments. |
| ~~Node SDK `authorize()` doesn't accept a user JWT context~~ | **Confirmed** | Resolved in Phase 0: the method does not exist at all. Phase 4 uses `generateAuthorizationSignature()` + raw REST. |
| Webhooks unreliable behind a tunnel | Medium | Polling, built in Phase 5 rather than bolted on later. |

---

## Verification

**Phase 0 gate:** spike scripts print an arcscan tx hash and a key quorum ID. Nothing proceeds until both do.

**End-to-end on Arc testnet, in the browser:**
1. Sign up as `alice@` (admin) → org created → treasury address shown → fund from faucet → balance appears.
2. Seed `bob@` (approver) and `carol@` (member).
3. Carol submits $100 to a contractor address with an invoice PDF → clears without a second approver → arcscan link resolves → recipient balance increases by exactly 100.000000.
4. Carol submits $2,000 → pending, "awaiting 2 approvals," funds have not moved.
5. Alice approves → still pending at 1 of 2.
6. Bob approves → settles → tx hash appears → treasury balance drops by 2,000.
7. Carol tries to approve her own $2,000 request → denied by policy, shown as a clear message.
8. History shows both payments with invoices, approvers, timestamps, and tx links.
9. Submit to an internal member by email → resolves to their embedded wallet → settles.

**Negative checks:** malformed address rejected client- and server-side; zero/negative amounts rejected; double-approval doesn't double-count; a member of org A cannot read or approve org B's requests; a non-member cannot fetch an invoice file by guessing its URL.
