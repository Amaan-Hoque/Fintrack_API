# PROMPTS.md — Claude Code Prompt Chain for FinTrack API

This document records the actual sequence of prompts used to build the FinTrack API backend with Claude Code, the Claude Code features invoked at each step, the prompting techniques used, and the manual corrections applied after generation. It is a working log, not a tutorial — every prompt below is verbatim from the session.

---

## 1. Prompt Chain

### Step 1 — Establish project standards (role-based prompting)

> Act as our FinTrack Lead Architect. We are building our backend using the MEAN stack (Node.js, Express,
> MongoDB with Mongoose).
> Create CLAUDE.md at the project root with the following mandatory project standards:
> 1. Layered Architecture: model -> repository -> service -> controller
> 2. Money Representation: Stored strictly as integer cents (no floating-point drift)
> 3. Logging: Structured JSON logging via Winston. NEVER use console.log/console.error
> 4. Security: All endpoints must be scoped to req.user.id (strict multi-tenant isolation, no IDOR)
> 5. Testing: Jest with Supertest
> 6. Constraints: Never allow global deletes, never allow expenses with < 2 participants.
> Also create .claude/rules/transactions.md for directory-specific transaction security rules.

- **Feature used:** none of the special slash/@ features yet — plain generation, but the output (`CLAUDE.md`, `.claude/rules/transactions.md`) becomes the standards artifact every later prompt is checked against.
- **Technique:** *role-based prompting* ("Act as our FinTrack Lead Architect") to frame authority/tone, and *decomposition* — six independently-specified standards rather than one vague "write good code" instruction.
- **Outcome:** `CLAUDE.md` and `.claude/rules/transactions.md` created.

### Step 2 — Generate the first feature slice (decomposition)

> Generate a Transaction model and a Transaction service with create, get-by-user, and delete-all functions.
> Use a database.

Re-sent moments later with an explicit path constraint after an unrelated tool call was rejected:

> Generate a Transaction model and a Transaction service with create, get-by-user, and delete-all functions.
> Use a database. generate files under `src/transactions/`

- **Feature used:** none special; this is where the first real conflict with `CLAUDE.md` surfaced — "delete-all" directly contradicts the "never allow global deletes" constraint written in Step 1. Claude Code raised the conflict via **AskUserQuestion** instead of silently complying or refusing, and the human chose "replace with deleteById."
- **Technique:** *decomposition* (model + service as two explicit deliverables) and *constraint-driven self-check* (checking a new request against a previously-authored standards doc before generating).
- **Outcome:** `src/transactions/transaction.model.js`, `transaction.repository.js`, `transaction.service.js` (repository layer added even though not explicitly requested, because `CLAUDE.md` §1 mandates it), `deleteById` in place of the literal "delete-all."

### Step 3 — Review generated code against the standards doc (@ references)

> Review @src/transactions/transaction.model.js and @src/transactions/transaction.service.js against our
> standards in @CLAUDE.md.
> Produce REVIEW.md containing:
> 1. A structured vulnerability table (Issue, File/Line, Severity, Fintech Impact, Detection Method,
> Recommended Fix).
> 2. Analyze critical fintech risks: IEEE 754 float inaccuracies, unscoped database wipeout in delete-all,
> missing authorization.
> 3. A dedicated closing section titled: 'Issues Claude Code Introduced That Required Human Judgment'.

- **Feature used:** **@ file references** (`@src/transactions/transaction.model.js`, `@src/transactions/transaction.service.js`, `@CLAUDE.md`) to pin the review to exact files and the exact standards doc, rather than relying on conversational memory of what was generated.
- **Technique:** *constraint-based audit* — reviewing generated code against a written standards document instead of a vague "is this good?" ask; explicitly asked for a section owning up to self-introduced issues rather than only external vulnerabilities.
- **Outcome:** `REVIEW.md`, which — importantly — found real gaps (missing negative-amount validation, no `Number.isSafeInteger` check, no audit log on denied deletes, no test coverage) but also correctly reported that no literal "delete-all" existed in the code by that point, rather than fabricating a finding to match the prompt's framing.

### Step 4 — Refactor to production shape (explicit constraints, numbered spec)

> Refactor src/transactions/ to meet production standards:
> 1. Split into 4 layers: transaction.model.js, transaction.repository.js, transaction.service.js,
> transaction.controller.js, transaction.routes.js
> 2. Use Mongoose with integer cents, enums ('CREDIT', 'DEBIT'), and compound index { userId: 1, createdAt: -1 }
> 3. Fix delete-all: Scope it strictly to req.user.id (deleteByUserId) so users can never wipe other tenants'
> data
> 4. Use Winston logger instead of console.log

- **Feature used:** none special; notable because it **reversed** the Step 2 decision — the human explicitly re-requested a delete-all, this time pre-scoped to `req.user.id` by name (`deleteByUserId`). Because this is a deliberate, informed exception to a documented hard rule, `CLAUDE.md` and `.claude/rules/transactions.md` were both edited in the same turn to document the exception (with a dated approval line) instead of leaving the code and the docs contradicting each other.
- **Technique:** *constraint-driven refactor* with a numbered, unambiguous spec (four independent requirements, each individually verifiable).
- **Outcome:** `transaction.controller.js`, `transaction.routes.js` added; `deleteByUserId` implemented with a defensive guard (throws if `userId` is falsy, since Mongo would otherwise treat `{ userId: undefined }` as an unfiltered match-everything delete); docs updated.

### Step 5 — Context checkpoint

> /compact

- **Feature used:** **`/compact`** — a built-in CLI command, not a generation prompt. It compresses the conversation transcript while preserving continuity, handled by the harness itself.
- See [Section 3](#3-context-window-management-compact-vs-clear) for how this differs from `/clear`.

### Step 6 — Install dependencies

> npm install

- **Feature used:** none special; a direct shell instruction executed via the Bash tool (`express`, `mongoose`, `winston` had been added to `package.json` in Step 4 but not yet installed).

### Step 7 — Plan a new feature before writing code (`/plan`)

> /plan

> We need to build the Expense Splitting feature under src/expense-splitting/.
> Requirements:
> 1. Shared Expense Model: creator (userId), description, totalAmount (integer cents), splitType ('EQUAL' |
> 'CUSTOM'), participants array [{ userId, shareAmount, paidAmount }].
> 2. Validation: Must have at least 2 participants. In CUSTOM splits, sum of shares must equal totalAmount
> exactly.
> 3. Remainder Cent Distribution: In EQUAL split, allocate remainder cents (totalAmount % count) to
> participants so total cents are preserved without losing pennies.
> 4. Net Balance Calculation: In getPendingBalances(userId), aggregate pairwise debts across all shared
> expenses (e.g., if User A owes User B $30 and User B owes User A $10 -> Net: User A owes User B $20).
> 5. Endpoints: POST /api/expenses, GET /api/expenses/balances.
> Create the model, repository, service, controller, and routes, and connect them in src/app.js.

- **Feature used:** **`/plan`** (plan mode) — locks Claude Code to read-only actions plus writes to a single plan file until the human explicitly approves via `ExitPlanMode`. Within this plan, Claude Code:
  - launched an **Explore** subagent (read-only) to survey the existing `src/transactions/` conventions, check for an app entrypoint/auth middleware, and confirm no tests existed yet;
  - used **AskUserQuestion** twice (4 questions total) to resolve genuine open design decisions before finalizing the plan — e.g. whether `sum(paidAmountCents)` must equal `totalAmountCents`, which pairwise-settlement algorithm to use for `getPendingBalances`, whether to stub auth, whether to add test infrastructure, whether the creator must also be a participant, and whether to build an update endpoint now or defer it;
  - launched a **Plan** subagent to turn the confirmed decisions into a concrete, file-by-file design (schema fields, repository query shapes, the remainder algorithm, the greedy settlement algorithm with a worked numeric example);
  - wrote the final plan to a plan file and called **ExitPlanMode** to request approval before touching any real files.
- **Technique:** *decomposition* (five independently numbered requirements) plus *worked-example specification* ("e.g., if User A owes User B $30...") to disambiguate an otherwise underspecified algorithm.
- **Outcome:** Full 5-layer `src/expense-splitting/` feature, `src/middleware/auth.js` (stub), `src/middleware/error-handler.js`, `src/app.js`, `src/server.js`, `package.json` updates, and `.claude/rules/transactions.md` amended to widen its scope to `expense-splitting/` and record the new paid-sum invariant.

### Step 8 — Verify the build (iterative status checks)

> Check on jest test run results and report to user
*(sent multiple times across the session, each time polling a long-running background test/install command)*

- **Feature used:** background task execution (Bash `run_in_background`) plus the harness's task-notification system — Claude Code reported honest in-progress status ("still downloading, ~99MB/509MB") rather than guessing at results before the job finished.

### Step 9 — Add the required test suite (explicit case enumeration)

> Create tests/expenseSplitting.test.js and tests/setup.js using Jest and Supertest.
> We need minimum 6 test cases covering:
> - Case 1: Equal split among 3 participants with exact remainder cent validation
> - Case 2: Custom split with amounts matching total
> - Case 3: Custom split where amounts don't sum correctly (assert 400 error)
> - Case 4: Net balance calculation between two users across multiple shared expenses
> - Case 5: Edge case: expense with only 1 participant (assert 400 error)
> - Case 6: Unauthorized access attempt without auth headers (assert 401 error)
> Also add tests for remediated transaction user scoping.

- **Feature used:** none special; notable for explicitly naming file paths (`tests/expenseSplitting.test.js`, `tests/setup.js`) rather than letting file layout be inferred, and for referencing prior work ("remediated transaction user scoping") without re-explaining it — the phrase only makes sense because it points back to the IDOR/scoping fixes from Steps 2–4.
- **Technique:** *decomposition* via a numbered case list (six independently testable scenarios) — each case maps 1:1 to a `test(...)` block, which made the generated suite directly checkable against the prompt.
- **Outcome:** `tests/setup.js` (shared in-memory MongoDB bootstrap), `tests/expenseSplitting.test.js` (6 cases), `tests/transactionScoping.test.js` (new — closes a pre-existing test gap on the transactions feature), and removal of an earlier ad-hoc `shared-expense.controller.test.js` that the new suite superseded.

### Step 10 — This document

> Create PROMPTS.md detailing our Claude Code prompt chain: ...

---

## 2. Claude Code Features & Techniques Reference

| Feature / Technique | Where used | Purpose |
|---|---|---|
| `CLAUDE.md` | Step 1 (created), referenced in nearly every later step | Single source of truth for mandatory standards; every later generation/review/refactor was checked against it instead of relying on the model to "remember" preferences |
| `.claude/rules/transactions.md` | Step 1 (created), Steps 4 & 7 (amended) | Directory-scoped rules that extend/override `CLAUDE.md` for `transactions/`, `expenses/`, `expense-splitting/` |
| `@` file references | Step 3 | Pins a request to exact files/docs instead of ambiguous "the transaction code" |
| `/plan` | Step 7 | Forces read-only exploration + explicit human approval before any file is written for a nontrivial feature |
| `/compact` | Step 5 | Compresses conversation history without losing the working directory/file state |
| `AskUserQuestion` | Steps 2, 4, 7 | Used when a request conflicted with a documented standard, or when a design decision had no single objectively-correct answer |
| Explore / Plan subagents | Step 7 | Read-only research and design-drafting kept out of the main context, invoked only inside `/plan` |
| Role-based prompting | Step 1 | "Act as our FinTrack Lead Architect" set the authority/scope for the standards doc |
| Decomposition | Steps 1, 2, 4, 7, 9 | Every nontrivial ask was a numbered list of independently verifiable requirements, not a single vague sentence |
| Constraint-driven generation/review | Steps 2, 3, 4 | Requests and reviews were explicitly checked against `CLAUDE.md`/`transactions.md` rather than generic "best practice" |
| Worked-example specification | Step 7 | The "$30 / $10 / net $20" example in the prompt disambiguated the balance-netting algorithm before any code was written |

---

## 3. Context Window Management: `/compact` vs `/clear`

Only `/compact` was used in this session; `/clear` was not. The distinction matters for how this project should be worked on across a long build:

- **`/compact`** (used in Step 5) summarizes the existing conversation in place, discarding verbose tool output and raw transcript while preserving the *gist* of decisions made and file state already on disk. It's safe to run whenever the transcript is getting long but the work is continuing on the same feature/thread — you keep continuity (e.g. "why did we choose `deleteByUserId` over a hard ban?") without paying full token cost for every prior tool call.
- **`/clear`** wipes the conversation entirely and starts a fresh context with no memory of anything said or decided in this session. It is appropriate when starting a genuinely unrelated task, or when the transcript has accumulated so much dead weight that even a summary isn't worth carrying forward.
- **Why this project tolerates `/clear` better than most:** every durable decision in this session was written to a file, not left to live only in conversation memory — `CLAUDE.md` (standards), `.claude/rules/transactions.md` (directory rules, amended twice), `REVIEW.md` (audit findings), and the plan file under `.claude/plans/`. A future session that starts with `/clear` and then re-reads `CLAUDE.md` will recover the same hard constraints (no cross-tenant deletes except the documented `deleteByUserId` exception, integer-cents money, `req.user.id` scoping, etc.) without needing the original conversation at all. `/compact` was preferred here specifically because the *expense-splitting* planning (Step 7) built directly on conventions established in the *transactions* work (Steps 2–4), and losing that thread would have meant re-deriving them from files rather than reusing already-agreed decisions.
- **Practical rule of thumb for this repo:** `/compact` mid-feature (as done here between the transactions refactor and the expense-splitting plan); reserve `/clear` for a genuinely new feature area where nothing in the current thread is needed and even a summary would be noise — since `CLAUDE.md`/`.claude/rules/` carry the load-bearing context either way.

---

## 4. Post-Generation Corrections

Real fixes applied after initial generation, and one deliberately-not-a-fix noted for contrast:

- **User scoping on delete (real, multi-round correction).** The first ask (Step 2) requested a literal "delete-all" function. Because `CLAUDE.md` had just been written to forbid global/bulk deletes, this was flagged instead of implemented as asked, and the human chose a single-item `deleteById` instead — no delete-all existed after Step 2. In Step 4, the human explicitly re-requested a delete-all, this time named and scoped (`deleteByUserId(userId)` filtered strictly on `req.user.id`). The implementation adds a defensive guard the plain request didn't spell out: the repository function throws if `userId` is falsy before querying, because Mongo/Mongoose treats `{ userId: undefined }` as an *unfiltered* match — without that guard, a bug upstream that failed to populate `req.user.id` would silently wipe every tenant's data instead of erroring. `CLAUDE.md` and `.claude/rules/transactions.md` were updated in the same turn to document this as an approved, dated exception rather than leaving the docs and code inconsistent.
- **Money-safety gap found and fixed.** `REVIEW.md` (Step 3) flagged that the original `transaction.model.js`/`transaction.service.js` only checked `Number.isInteger` on `amountCents`, with no `min: 0` bound and no `Number.isSafeInteger` check — meaning a negative amount or a value beyond `2^53-1` could pass validation. The Step 4 refactor added `min: 0` and switched the validator to `Number.isSafeInteger` in the schema, and mirrored the same check in the service layer.
- **Missing audit trail on denied deletes, fixed.** `REVIEW.md` also flagged that only successful deletes were logged via Winston — a denied/not-found delete (which can indicate a cross-tenant IDOR probe) left no trace. The Step 4 refactor added a `logger.warn` call on that path, and this pattern was carried forward into `shared-expense.service.js`'s `updateParticipants` for the same reason.
- **Stray leftover code, self-caught before running tests.** While writing the original `shared-expense.controller.test.js` (later superseded), a nonsensical duplicate `.set(...)` call (`.set('x-dev-user-id: A'.split(':')[0], A)`) was introduced by mistake and removed in the same turn before the test was ever run — a plain authoring slip, not a design issue.
- **Penny/remainder-cent allocation — designed correctly up front, not a post-hoc fix.** Unlike the items above, the EQUAL-split remainder algorithm (`base = Math.floor(total / n)`, remainder cents assigned to the first `n` participants in submitted order) was specified as an explicit requirement in Step 7's prompt, worked through numerically during the `/plan` design phase (`1000 / 3 → [334, 333, 333]`) and confirmed via `AskUserQuestion`-gated decisions *before* any code was written, then verified by Case 1 in the Step 9 test suite. No incorrect version of this logic was ever generated or shipped in this session — it's included here only because the remainder-cent worked example was specified precisely enough in the prompt (and validated in planning) to avoid needing a correction at all, which is the intended lesson: front-loading a worked numeric example into the prompt prevented the bug class rather than requiring a fix for it.
