# TOOL_STRATEGY.md — Claude Code Usage Strategy for FinTrack API

## 1. Feature Usage Log

Six concrete instances from this session, spanning six distinct Claude Code features (more than the required four).

| # | Feature | When used | Why it was the right tool |
|---|---|---|---|
| 1 | **`CLAUDE.md` persistent standards file** | Created in Step 1, referenced in every subsequent generation/review/refactor prompt | Encodes hard constraints (integer-cents money, no bulk deletes, `req.user.id` scoping) as a file the model re-reads each turn, instead of relying on conversational memory that a `/compact` or new session would erode |
| 2 | **`AskUserQuestion`** | When "generate a delete-all function" conflicted with the just-written "never allow global deletes" rule | The conflict had no single correct resolution the model should decide unilaterally (drop it vs. scope it vs. implement it exactly as asked) — this is a governance decision, not an engineering one, so it was surfaced instead of silently resolved |
| 3 | **`@file` references** | `Review @src/transactions/transaction.model.js and @src/transactions/transaction.service.js against our standards in @CLAUDE.md` | Pinned the review to exact files and the exact standards doc, avoiding an ambiguous "review the transactions code" that could drift to files not yet written or stale memory of earlier drafts |
| 4 | **`/plan` mode (+ `Explore` and `Plan` subagents, `ExitPlanMode` gate)** | Before writing any `expense-splitting` code | The feature involved a genuinely tricky algorithm (pairwise debt netting) and touched a repo with no existing app entrypoint/auth — planning first, with a read-only research pass and a human approval gate, caught missing pieces (no auth middleware, no tests) before a single line of feature code was written |
| 5 | **`/compact`** | Mid-session, after the transactions refactor and before the expense-splitting plan | The transcript had accumulated verbose tool output from the refactor; compacting kept the working thread (why `deleteByUserId` was chosen, what conventions to mirror) without paying full token cost, since durable decisions were already persisted to `CLAUDE.md` rather than only living in chat history |
| 6 | **Background `Bash` execution + task-notifications** | `npm install`, `npx jest`, and the `mongodb-memory-server` binary download, all of which ran well past interactive timeouts | Let the conversation continue (status updates, writing other files) while a multi-minute command ran, and surfaced real interim state ("~99MB/509MB downloaded") instead of blocking or guessing at a result |

## 2. Scenario Responses

Eight realistic fintech-development scenarios, each answered with the exact Claude Code capability to reach for.

1. **You're dropped into an unfamiliar part of the codebase and must match existing conventions before writing new code.**
   → Launch an **`Explore` subagent** (read-only, fast pattern/grep search) to survey existing files and report conventions back, without burning main-thread context on raw file dumps.

2. **A request conflicts with a documented hard constraint (e.g., "add a delete-all endpoint" vs. a written "no bulk deletes" rule).**
   → **`AskUserQuestion`**, framed around the specific conflict with the specific rule (cite the `CLAUDE.md` line), offering the concrete resolution options rather than silently complying or silently refusing.

3. **You need to design a nontrivial, multi-file feature (new model + algorithm + endpoints) before writing any code.**
   → **`/plan` mode**, using an `Explore` subagent for research, a `Plan` subagent to draft the file-by-file design, and the **`ExitPlanMode`** tool to gate on human approval before any file is written.

4. **A shell command (dependency install, full test run, binary download) will take minutes and would otherwise block the conversation.**
   → **`Bash` with `run_in_background: true`**, relying on the automatic **task-notification** when it completes instead of polling with sleeps.

5. **You want a code review scoped to exact files against an exact standards document, not "the codebase in general."**
   → **`@file` references** in the prompt (`@path/to/file.js`, `@CLAUDE.md`) to pin scope precisely.

6. **The conversation has grown long mid-feature, but recent decisions (why an algorithm was designed a certain way) are still needed.**
   → **`/compact`** — summarizes the transcript in place while preserving the working thread; safe here specifically because durable decisions are also written to `CLAUDE.md`/rule files, not only chat history.

7. **You're about to start a completely unrelated feature area and the current thread is pure overhead.**
   → **`/clear`** — wipes conversation memory entirely; appropriate once nothing in-thread is still needed, since `CLAUDE.md` carries the load-bearing project context forward regardless.

8. **You need to hand off a large chunk of independent research or drafting without polluting your own context with its raw tool output.**
   → The **`Agent` tool** (a fresh subagent for genuinely new investigation, or `subagent_type: "fork"` to hand off a piece of the current context) — keeps verbose intermediate output out of the main thread while the result comes back as a concise report.

## 3. Real Limitations Encountered This Session

1. **`mongodb-memory-server`'s ~500MB MongoDB binary download failed with `ECONNRESET` on every attempt in this sandboxed network.** This blocked 3 of the written test suites from ever actually executing here. *Resolution:* ran the DB-independent (mocked) unit tests immediately to confirm the underlying logic was correct, was transparent in `PR_DESCRIPTION.md` and to the user that those specific suites are written-but-unverified rather than claiming false success, and proposed a concrete fallback (`MONGOMS_SYSTEM_BINARY` pointing at a locally-installed `mongod`) instead of retrying the same failing download indefinitely.

2. **A user-rejected tool call (an `npm install mongoose` attempted mid-conversation) interrupted the expected flow.** Rather than re-issuing the identical call (which the tool-use guidance explicitly warns against), the dependency was instead added directly to `package.json` and the actual `npm install` was deferred to when the user ran it themselves — which they later did explicitly, succeeding without incident.

3. **Several requirements had no single objectively-correct design and weren't derivable from the code or the prompt alone** — e.g., whether `sum(paidAmountCents)` must equal `totalAmountCents`, which pairwise-settlement algorithm to use for multi-payer expenses, whether the creator must also be a participant, and whether to build an update endpoint immediately or defer it. *Resolution:* each was raised via `AskUserQuestion` with a recommended default and a clear trade-off, rather than guessing silently — important here specifically because a wrong guess in money-handling logic (e.g. the settlement algorithm) would have been a correctness bug, not just a style disagreement.
