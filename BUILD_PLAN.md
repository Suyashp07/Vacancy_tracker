# Yash Honda Vacancy & Hiring Tracker — Build Plan v1

**Status:** Draft for review. Engineering decisions below are **my proposed defaults** unless marked `CLIENT`. Nothing here is silently invented — every assumption is visible and reversible.
**Paired with:** [Master Document v2](./Yash_Honda_Vacancy_Hiring_Tracker_Master_Document_v2.md) (source of truth for product/policy) and the 5 page prototypes in [`prototype/`](./prototype/).

---

## 1. Locked decisions (from this session)

| Area | Decision |
|---|---|
| Stack | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, deployed on Vercel |
| Backend | Supabase: Postgres + Auth + private Storage. Authorization enforced in a trusted server layer, RLS as defense-in-depth |
| V1 scope | Core tracker first → hold/ageing/FY reporting → legal docs + privacy/retention + audit-log UI |
| Workflow | Config-driven tables read at runtime, seeded with the default workflow. Admin visual editor deferred to Phase 2 |
| Notifications | In-app only in v1 (no email provider) |
| Vacancy approval | Single approver task, any one of Owner/CEO; first to act closes it |
| Hired | Actual joining date (not offer acceptance) |
| Candidate photo | Required for all before Send-for-Approval; rule stored as config; audited exception path |
| Self-approval | Blocked for every role, including Admin/Owner/CEO |

---

## 2. Remaining Section-11 items — adopted defaults

These are the 9 blockers I raised. I have adopted a default for each so the build can start. **Confirm or override any line; an override is a small, isolated change.**

| # | Item | Adopted default | Cost if changed later |
|---|---|---|---|
| 1 | User roster | 6 seed accounts (synthetic emails) until you supply real ones. You = **Admin** (system configuration only). Separate Owner and CEO accounts created, since self-approval is blocked globally and Owner/CEO requests must route to the other | Low |
| 2 | Legal entity + privacy/grievance contact | Content authored behind a **publish gate**: legal pages exist and render from DB, but the app flags "not approved for production" until entity name and a verified contact are entered. No placeholders ship | Low |
| 3 | Retention periods | Unsuccessful candidate: **180 days** after final decision. Hired-candidate recruitment record: **3 years** after joining. Audit events: **5 years**, then archived. Requests/positions: retained indefinitely as non-personal business records | Medium (config only; values are DB-driven) |
| 4 | Supabase region | `ap-south-1` (Mumbai) for dev + prod, to keep §5.5 transfer analysis simple. Fall back to Singapore only if unavailable on the chosen plan | Low if decided before first migration |
| 5 | Volume assumption | ~600 requests / ~1,400 positions / ~6,000 candidates per year, ~2,500 documents. Pagination at 25 rows; server-side aggregates for dashboard; no virtualization needed at this scale | Low |
| 6 | Invite email delivery | v1 uses **admin-generated invite links** (no outbound email): Admin creates a user, gets a one-time setup link to hand over in person/WhatsApp. Real SMTP plugged in at Phase 2 once the client confirms the provider | Medium — this is the only way to keep v1 free of an email vendor |
| 7 | Candidate notice language | English primary, Marathi secondary, both stored as `legal_documents.language` rows. Only English authored in v1 | Low |
| 8 | "Left" reason code | `New` / `Replacement — employee left` / `Replacement — planned exit`. Admin-editable enum, seeded | Low |
| 9 | Branding | Master doc §8R honoured: off-white canvas, charcoal type, single restrained blue accent. No Honda red in the UI chrome; logo slot left empty until supplied | Low |

---

## 3. Repo layout

```
yash-honda-hiring-portal/
  supabase/
    migrations/            # ordered, immutable SQL
    seed.sql               # facilities, roles, permissions, default workflow, legal docs, synthetic demo data
  src/
    app/                   # Next.js App Router (route group per area)
    server/
      policy/              # can(user, action, record) — the ONLY authorization entry point
      workflow/            # attemptTransition() — the ONLY status-write entry point
      audit/               # emit(event) — the ONLY activity_events writer
      reports/             # fy.ts, ageing.ts, dashboard aggregates
      files/               # signed URL issuance + access log
    components/            # shared UI
    lib/                   # zod schemas, formatting, date utils
  tests/
    policy/                # role x facility matrix
    workflow/              # transition legality
    privacy/               # file access, RLS bypass attempts
```

**Three hard rules the code review enforces:**
1. No page, route or component writes a status column directly. It calls `attemptTransition`.
2. No query runs without passing through `policy` (`server/` uses a `guardedSelect(table, user, filter)` helper; RLS mirrors it in Postgres).
3. Every mutation emits its audit row **in the same transaction** as the business write, or the transaction rolls back.

---

## 4. Data model (superset of Master doc §4)

Tables already defined in §4 of the master doc are unchanged. Additions:

**`request_number` generation:** `YH-<FY short>-<4-digit sequence>` e.g. `YH-2627-0147`, sequence from a per-FYear counter table (no gaps required, but monotonic). Position number: `<request_number>-P<n>`. Immutable after creation.

**`position_adjustments`** — explicit, audited record for headcount changes after approval: `vacancy_request_id`, `action` (`add_positions` / `cancel_positions`), `count`, `reason`, `actor_user_id`, `reapproval_task_id`. Never mutates existing positions.

**`document_access_logs`** — `candidate_document_id`, `actor_user_id`, `action` (view/download), `issued_at`, `outcome`. Separate from `activity_events` because document views are high-frequency.

**`workflow_field_definitions`** — lets the form itself be config-driven later without a new table shape: `step_id`, `field_key`, `label`, `type`, `is_required`, `order`.

**`notification_outbox`** — in-app only in v1: `recipient_user_id`, `type`, `entity`, `body_template_key`, `read_at`. A `channel` column is present and defaulted to `in_app` so adding email later is a writer change, not a schema change.

**Integrity:** `numeric(12,2)` for money. UTC everywhere, `Asia/Kolkata` at render. `requested_quantity` is display-only once approved — headcount truth is the count of non-cancelled position rows. Partial unique index preventing two open approval tasks on the same record. FK on `candidates.position_id` `ON DELETE RESTRICT`.

---

## 5. Workflow seed (default published version)

`workflow_definitions`: `yash_honda_default` v1, status `published`.

**Request-level steps:** `draft` (off by default) → `submitted` → `pending_vacancy_approval` → `approved` | `returned_for_clarification` | `rejected` → `closed`.

**Position-level steps:** `approved_created` → `hr_searching` → `shortlisted` → `sent_for_candidate_approval` → `maybe_further_review` | `candidate_rejected` | `approved_proceed_to_offer` → `offer_in_progress` → `hired` ; terminal `closed_unfilled` / `cancelled`. `on_hold` is an **overlay** (preserves `previous_status_before_hold`) at any non-terminal position step.

| Step | Required fields | Required docs | Allowed actors | SLA warn / overdue |
|---|---|---|---|---|
| submitted | all form fields | none | any user with `create_request` in facility | — |
| pending_vacancy_approval | — | none | Owner, CEO (not requester) | 2d / 5d |
| hr_searching | assigned HR | none | HR | 7d / 14d |
| sent_for_candidate_approval | HR note, proposed comp | resume + photo | HR | 1d / 3d |
| candidate decision | reason if Rejected | none | Owner, CEO | 2d / 5d |
| offer_in_progress | joining date | none | HR | 7d / 21d |
| hired | joining date confirmed | none | HR | — |
| closed_unfilled | closure reason | none | Owner, CEO, Admin | — |

Guard rails baked into the seed and the validator: no transition that skips `sent_for_candidate_approval` into a decision; `candidate_rejected` returns the position to `hr_searching`; every path reaches a terminal state; a transition cannot clear a `required_documents_config`.

**4 ageing clocks** computed server-side, stored nowhere (derived from `activity_events`): total calendar age (request `submitted_at`), stage age (`current_stage_entered_at`), active hiring age (calendar minus cumulative hold windows), hold age (`hold_started_at`).

---

## 6. Authorization

Permission keys exactly as §3.10B of the master doc. Evaluation order: `user_permission_override` → `role_permissions` → deny. Facility scope applied after the permission check passes. Server-side on every read and write; RLS policies generated from the same table so both layers cannot drift.

Named non-negotiables: `view_resume` / `download_resume` denied to Finance and Employee by default; `export_candidates` its own permission (not inherited from `export_reports`); Admin cannot grant a permission to themselves that they lack; the `Admin` role has no `approve_vacancy` grant so Admin-created requests route to Owner/CEO.

---

## 7. Route map (matches the 5 prototypes)

| Route | Page | Prototype |
|---|---|---|
| `/dashboard` | Summary tiles, My Actions strip, ageing list, facility breakdown, period selector | [dashboard.html](./prototype/dashboard.html) |
| `/requests` | Filterable request register + new-request drawer with live position preview | [requests.html](./prototype/requests.html) |
| `/requests/[id]` | Request detail → positions accordion → candidates, timeline, hold/resume | [request-detail.html](./prototype/request-detail.html) |
| `/my-actions` | Personal approval queue, candidate document review, decision panel | [my-actions.html](./prototype/my-actions.html) |
| `/admin` | Users, Access, Workflow (read-only config view in v1), Facilities, Audit Log | [admin.html](./prototype/admin.html) |
| `/on-hold`, `/closed`, `/legal`, `/login` | Phase 1, no prototype yet | — |

Prototype nav wires between all five, so the full path "raise request → approve → HR submits candidate with resume+photo → Owner decides → position Hired" can be clicked end to end.

**Deployed design preview:** https://yash-honda-hiring-tracker.vercel.app (source: `prototype/`, static HTML/CSS/JS with a shared synthetic dataset in `prototype/assets/data.js`; `index.html` is the page selector). The identity switcher in the top bar of every page re-renders nav, queues, scope and document access as the selected role. Hosted on the `swaniki` Vercel team, project `yash-honda-hiring-tracker`, robots `noindex`, and it holds no backend and no real candidate data.

---

## 8. Files

Private Supabase Storage bucket `candidate-documents`, path `facility/{id}/position/{id}/candidate/{id}/{type}/{uuid}.{ext}`. Browser uploads to a server route that validates declared MIME **and** magic bytes, size cap 5 MB resume / 2 MB photo, re-encodes photos to strip EXIF, renames to UUID, records the checksum. No object key ever reaches the client. Access via `POST /files/{docId}/grant` returning a 60-second signed URL after the policy check, with a row written to `document_access_logs`.

---

## 9. Build order

| Sprint | Ships | Acceptance check |
|---|---|---|
| 0 | Supabase project (ap-south-1), migrations, seed, auth, invite-link creation, role switch | Sign in as each of 6 seeded users, land on the right nav |
| 1 | `policy`, `audit`, `workflow` engines + tests | Permission matrix and transition legality pass before any screen exists |
| 2 | Vacancy request form, request register, approval task + decision, position auto-creation | Approved 4-headcount request yields exactly 4 positions, one audit event per action |
| 3 | Candidates, private upload, resume+photo gate, exception path, candidate decision flow | Send-for-Approval blocked with a missing photo; audited exception succeeds |
| 4 | Dashboard tiles, My Actions, drill-down panel, ageing | Every tile count equals its drill-down row count, under the same filters |
| 5 | Hold/resume overlay, On Hold view, FY reporting periods, comments, request/position history | Hold freezes stage age while calendar age continues; FY = 1 Apr–31 Mar |
| 6 | Retention fields, notice-delivery recording, audit-log UI, backup + restore test | §6.5 pre-launch checklist demonstrable |

Synthetic data only in every sprint. Production go-live gates on legal sign-off items (§2 rows 2, 3, 6, 7).

---

## 10. Test matrix

Inherits §9 of the master doc, plus the specific traps this design must prove:
- Tile count vs drill-down count parity under 3 filter combinations.
- 3 candidates on 1 position → dashboard shows 1 position, never 3.
- Candidate rejected → position back in `hr_searching`, request still `approved`.
- Headcount reduced after approval → old positions cancelled via `position_adjustments`, not overwritten.
- Guessing an object URL, replaying an expired signed URL, and a deactivated user downloading a previously-accessible file → all denied and logged.
- Admin self-grant and requester self-approval → refused.
- Workflow version v2 published while v1 requests are mid-flight → v1 records unchanged.

---

## 11. Deliberately not in v1

Visual workflow editor · email/WhatsApp notifications · escalations and reminder automation · resume parsing or any AI · candidate scoring · interview scheduling · offer-letter generation · multi-entity payroll · candidate-facing portal · analytics on candidate behaviour.

---

## 12. Your turn

The 5 prototypes render this plan visually. Read them, then tell me: which page is closest to the final look, what feels missing or over-built, and whether any Section-2 default should be overridden before I start Sprint 0.
