# FinTrack API — Project Standards

MEAN-stack backend (Node.js, Express, MongoDB/Mongoose). These standards are mandatory for all code in this repo — do not deviate without explicit sign-off from the Lead Architect.

## 1. Layered Architecture

Every feature follows a strict one-directional dependency chain:

```
model -> repository -> service -> controller -> route
```

- **Model** (`*.model.js`): Mongoose schema/model only. No business logic.
- **Repository** (`*.repository.js`): All Mongoose queries live here. Nothing outside a repository may call `Model.find/create/update/delete` directly.
- **Service** (`*.service.js`): Business logic, validation rules, orchestration across repositories. No direct DB access, no `req`/`res`.
- **Controller** (`*.controller.js`): Parses `req`, calls service(s), shapes `res`. No business logic, no direct DB access.
- **Route**: Wires HTTP verb + path to controller + middleware only.

A layer may only call into the layer directly below it (controller -> service -> repository -> model). Never skip a layer (e.g. controller calling a repository directly), and never call upward.

## 2. Money Representation

- All monetary values are stored and passed internally as **integer cents** (`amountCents: Number`, integer). Never store or compute money as a float/decimal.
- Convert to/from display currency (e.g. `12.34`) only at the API boundary (request parsing / response serialization), never in the service or repository layers.
- No floating-point arithmetic on money, anywhere. Use integer math.

## 3. Logging

- Structured JSON logging via **Winston** only.
- `console.log`, `console.error`, `console.warn`, `console.info` are **forbidden** anywhere in `src/`. Use the shared Winston logger instance instead.
- Log entries should include relevant context (e.g. `userId`, `requestId`, route) as structured fields, not interpolated into the message string.

## 4. Security — Multi-Tenant Isolation

- Every data-access query must be scoped to `req.user.id`. There is no cross-user data access.
- No endpoint may return, modify, or delete another user's data (no IDOR). Ownership must be enforced at the **repository** layer (filter by owner id in the query itself), not just checked in the controller.
- Never trust a user/owner id from the request body or params — always derive it from the authenticated `req.user.id`.
- See [`.claude/rules/transactions.md`](.claude/rules/transactions.md) for transaction-specific rules.

## 5. Testing

- **Jest** + **Supertest** for all tests.
- Every controller/route must have Supertest integration tests covering: success path, unauthorized/cross-tenant access attempt, and validation failure.
- Every service must have Jest unit tests covering business rules (see Constraints below).

## 6. Hard Constraints

- **Never** implement or expose a global/bulk delete (e.g. `deleteMany({})`, "delete all"). Deletes must always be scoped to a single resource owned by `req.user.id`.
- **Never** allow an expense to be created or updated with fewer than 2 participants. Enforce this in the service layer as a validation rule, and reject with a 4xx error otherwise.
