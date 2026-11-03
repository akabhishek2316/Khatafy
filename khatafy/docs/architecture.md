# Architecture

```
Browser (React PWA)  ──HTTPS──►  Supabase
  apps/web                       ├─ Auth (email/password, optional Google)
  packages/core (shared)         ├─ Postgres: tables + RLS + SECURITY DEFINER RPCs (all reads/writes)
                                 ├─ Storage: receipts (private), avatars (public)
                                 └─ Realtime: postgres_changes → UI cache invalidation
```

* **All data access is RPC.** The client never queries tables directly. Every RPC checks `auth.uid()`, group membership and role, writes an audit row and returns `jsonb`. Tables also have RLS as a second wall.
* **Money**: integer paise, max ₹10 crore per entry. `compute_splits` (SQL) and `computeSplits` (TS) implement the same algorithm; `supabase/tests/parity.test.ts` proves they agree.
* **Immutability**: expenses/payments are never hard-deleted (trigger-enforced). Edits create a new split `version` + a row in `expense_revisions`. Void/reverse keep the record.
* **Concurrency**: optimistic `expected_version` on edit/void; idempotency keys on create expense / record payment (offline retries are safe); rate limits in Postgres.
* **Balances**: `paid − share + settlement_paid − settlement_received`, confirmed payments only. Month boundaries use the group's time zone.
* **Offline**: new expenses queue in `localStorage` (`DraftQueue`), idempotency key = draft id; the service worker caches the app shell only (never API responses).
* **i18n**: `packages/core/src/messages.*.ts`; DB errors are stable codes (`RAISE EXCEPTION 'CODE'`) mapped to `err.CODE` strings. A test fails if any key used in the UI or raised by SQL lacks English or Hindi text.
