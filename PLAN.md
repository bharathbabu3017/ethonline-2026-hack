# PayGate — treasury payouts with approval controls

## Context

Companies paying contractors, vendors, and employees today run payouts through a finance person with bank access. That's a bottleneck and a single point of failure: one compromised account moves any amount, and the audit trail lives in email threads.

**PayGate** puts that flow behind a shared treasury with enforced approval rules. A company creates an org and gets a treasury wallet — no seed phrases, no key management. Any employee can submit a payment request with an invoice attached. Small payments clear immediately. Payments over the company's threshold need a second approver before funds move. Everything settles as USDC on Arc, and every request, approval, and transfer is on the ledger.

The design decision that matters: **the approval threshold is enforced cryptographically inside Privy's TEE, not by application code.** A compromised PayGate backend still cannot move funds over the limit — it has no signature to offer. That is the difference between a payments product and an approval UI bolted onto a hot wallet.

Repo is empty (README + installed skills). Greenfield.

---

## Decisions

| Decision | Choice |
|---|---|
| Custody & settlement | Privy organization wallet holds USDC on Arc, executes payouts via RPC intents |
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
   caip2 eip155:5042002, USDC.transfer calldata
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
   Privy signs + broadcasts on Arc
              ↓
   intent.executed webhook → tx hash → payment history
```

### Quorum + policy topology (per org)

Three Privy objects, created once at org setup:

1. **`Approvers` key quorum** — `user_ids` = approver-eligible members, `authorization_threshold: 2`. Becomes the org's `default_key_quorum_id`, so Privy makes it the treasury wallet's owner. Unrestricted: can authorize any payment and administer the wallet.
2. **`Members` key quorum** — `user_ids` = all members, `authorization_threshold: 1`. Attached to the wallet as an `additional_signer` with `override_policy_ids: [smallPaymentPolicyId]`. Can transact within policy scope; cannot change wallet config.
3. **`smallPaymentPolicy`** — `default_action: DENY`, one ALLOW rule on `eth_sendTransaction`:
   - `ethereum_transaction.to` `eq` `0x3600000000000000000000000000000000000000` (USDC on Arc)
   - `ethereum_transaction.chain_id` `eq` `5042002`
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

### Phase 0 — Prove the foundation (blocking)

Two unknowns can invalidate the architecture. Cheap to test now, expensive to discover in Phase 4.

1. **Does Privy execute on Arc?** Privy's docs never mention Arc. `caip2` is typed generically as `` eip155:${number} ``, and Privy falls back to viem's default RPC for non-native chains (`arcTestnet` is in viem). Probable, not certain. Test: create a plain server wallet, fund it from https://faucet.circle.com, `eth_sendTransaction` with `caip2: 'eip155:5042002'` sending 0.01 USDC. Confirm on https://testnet.arcscan.app.
2. **Are key quorums enabled on the app?** Privy's docs label key quorums "an advanced feature — reach out to discuss whether this setup is right for your integration." If they're gated per-app, you need Privy to turn them on, which is a human-turnaround dependency. Test: `keyQuorums().create()` with two user IDs and threshold 2.

Throwaway scripts in `scripts/spike/`. **Check:** both print a real result (tx hash, quorum ID). Fallbacks in Risks below.

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
6. `intents().rpc(walletId, { method: 'eth_sendTransaction', caip2: 'eip155:5042002', params: { transaction: { to: USDC_ARC, data, value: '0x0' } } })` — no `sponsor`; the treasury pays its own gas in USDC.
7. Persist the request + invoice rows; set `route` by comparing against `org.thresholdMicros`.
8. If AUTO, immediately run the Phase 4 authorize path with the requester's token so it settles in one action.

Serve invoice files through an authenticated route that checks org membership — never as static assets.

**Check:** submit a $50 request with a PDF attached; the request appears with the invoice viewable and a pending intent ID.

### Phase 4 — Approve and settle

`POST /api/requests/:id/approve`:

1. Verify the approver's token; confirm org membership; confirm they haven't already approved.
2. `intents().authorize(intentId, { user_jwts: [accessToken] })` — the Node SDK's `AuthorizationContext` accepts `user_jwts` and handles fetching the ephemeral user signing key and computing the P256 signature. Confirm the Node `authorize()` arity against SDK types; the documented example is Java. Fallback: request a user signing key via REST, sign, `POST /v1/intents/{id}/authorize` with `{ signature, timestamp }`.
3. Record `Approval` + `AuditEvent`. Privy is idempotent per signer; the unique constraint keeps the UI honest.
4. Re-fetch the intent, mirror `status` and `action_result.hash` onto the row.

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
| Privy won't route `eip155:5042002` | Medium | Ask Privy to add Arc. Otherwise use `eth_signTransaction` and broadcast yourself via viem on Arc RPC — Tier 2 instead of Tier 3. Quorum and policy enforcement are fully intact, since policies evaluate on the signing request. The security model is unchanged; you just own the broadcast and receipt polling. |
| Key quorums gated on your app | Medium | Contact Privy on day one. Interim: single-owner wallet with app-level approval tracking, swap quorums in when enabled. This degrades the core guarantee, so escalate early rather than building around it. |
| Policy can't decode calldata on an unrecognized chain | Low | `ethereum_calldata` decodes from the ABI you supply, so it shouldn't be chain-dependent. If it is, fall back to app-level routing with the 2-of-N quorum still enforced for large payments. |
| Node SDK `authorize()` doesn't accept a user JWT context | Low | Documented REST path: fetch user signing key, sign, POST `{ signature, timestamp }`. |
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
