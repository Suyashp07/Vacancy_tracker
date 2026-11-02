# Yash Honda Vacancy & Hiring Tracker
## Master Product Document: BRD + PRD + Webapp Generation Prompt + Technical & DPDP Safeguards

**Document status:** Updated planning baseline for stakeholder review  
**Version:** 2.0  
**Date:** 14 October 2026  
**Client:** Yash Honda — Honda 2-wheeler sales and service business, Pune  
**Product type:** Internal business web application  
**Scope:** Vacancy and hiring workflow tracking; explicitly **not** a full recruitment / ATS platform. No AI, conversational dashboard, AI summaries, candidate scoring, or advanced automated workflows in the initial implementation.  
**Build status:** Planning only. This document is the source of truth for subsequent design and development.

---

# 1. Executive Summary

Yash Honda needs a simple, visually clear web application to centralize vacancy requests and track hiring requirements across nine facilities. Employees and managers can raise vacancy requests. Authorized management approves the requirement. HR then tracks the hiring progress for each individual position, including candidate submission for approval with a resume and photograph. Management needs a live dashboard, a personal action queue, ageing indicators, drill-down reports and a configurable workflow.

The product should be easy to use on desktop and mobile. The Admin (the implementation owner) must be able to manage users, permissions, facilities, workflow steps, transitions, required fields, approvers, ageing thresholds and notifications from the Admin Panel rather than changing code for ordinary workflow changes.

The product must also protect candidate information from the outset. Resumes, photographs and contact details are personal data. The application must use private file storage, least-privilege access, appropriate collection notices and consent/other lawful processing basis as confirmed by counsel, retention/deletion controls, audit trails, breach response procedures and vendor/processor controls.

## Explicit scope guardrails

The initial implementation is a conventional, rule-based workflow webapp. Do not implement AI, a conversational dashboard, resume parsing/summaries, candidate scoring/ranking, scheduled escalation bots, automated sourcing, WhatsApp automation or other advanced automations. Standard workflow state changes and basic record notifications, if enabled, must remain predictable and auditable.

The application must include in-app Terms of Use, Disclaimer, Internal User Privacy Notice, Candidate Privacy Notice, Acceptable Use & Confidentiality Rules, Data Retention and Deletion Summary, and a verified Privacy Request/Grievance Contact. Legal text must be versioned and approved before production use. The Admin must have a detailed, searchable System & Audit Log for business actions, configuration changes, privacy events, security events and safe operational errors.

## Product north star

> Any authorized person can request a vacancy in minutes; management can approve or pause it; HR can track every individual position and candidate submission; and everyone can see exactly what needs action, where hiring is stuck, and who is responsible.

## Recommended architecture in brief

- **Database:** PostgreSQL via Supabase for a practical integrated first version.
- **Candidate file storage:** Supabase private Storage for the simplest initial deployment, or Cloudflare R2 private buckets if storage economics or architecture later justify a separate object store.
- **Authentication and authorization:** server-enforced authentication and role/permission checks; never rely only on hidden UI controls.
- **Deployment:** use a production environment with backups, monitoring, restricted secrets and a tested restore process. The free tier is for prototype/testing, not the recommended production configuration for live candidate data.
- **AI and advanced automation:** explicitly excluded from this implementation. Dashboard filters and reports are deterministic, database-driven views. Do not add a conversational dashboard, AI features, scheduled escalation bots, automatic candidate ranking, or other unapproved automation.

---

# 2. Business Requirements Document (BRD)

## 2.1 Business context

Yash Honda operates multiple sales, service, office and godown facilities. Hiring needs are spread across these facilities. The client wants a central record of requested headcount, approvals, hiring stage, candidate decisions, holds, closures and pending actions.

The tracker should reduce reliance on calls, WhatsApp follow-ups and informal spreadsheets. It should make hiring progress and responsibility visible without introducing the complexity of a full recruitment platform.

## 2.2 Business objectives

1. Centralize vacancy requests across all nine facilities.
2. Ensure recruitment does not begin before the required vacancy approval, except through a documented and authorized override.
3. Track each requested position independently, even when a request contains multiple positions.
4. Require a resume and candidate photograph before a candidate is sent for approval, subject to a documented authorized exception.
5. Show management current status, ageing, pending approvals, holds and hiring outcomes.
6. Give each user a personal queue of actions waiting for their decision.
7. Allow the Admin to configure workflow and access rules without routine code changes.
8. Preserve a trustworthy history of requests, approvals, status changes, comments, document changes and administrative overrides.
9. Protect candidate data through privacy-by-design and security-by-design.
10. Keep the experience minimal, fast, responsive and usable by non-technical employees.

## 2.3 Success measures

The system should make it possible to measure:

- Percentage of vacancy requests with complete required fields.
- Time from submission to vacancy approval.
- Time in each hiring stage.
- Total calendar age and active hiring age of each position.
- Number and percentage of positions hired, cancelled, closed unfilled and on hold.
- Number of pending decisions by approver and their age.
- Number of positions with no update for a configured period.
- Number of candidate submissions missing mandatory documents (target: zero submissions sent without required attachments, except logged authorized exceptions).
- Whether all important actions have an actor, timestamp and audit record.
- Whether candidate files can be restored from backup and cannot be accessed by unauthorized users.

Do not treat the number of dashboard interactions as a business success metric. The main outcome is reliable, timely hiring visibility.

## 2.4 In-scope features

- User login and account management.
- Six initial roles: Admin, Owner, CEO, HR Team, Finance Team and Employee.
- User-level permission overrides and facility scope.
- Nine configurable facilities.
- Vacancy request form and unique request ID.
- Approval / reject / return-for-clarification workflow.
- One position record per requested headcount unit.
- Candidate records associated with a position, with support for multiple candidates per position.
- Mandatory resume and photograph before sending a candidate for approval.
- Candidate approval decisions: Approved, Rejected, Maybe / Further Review, On Hold, as configured.
- Offer/joining tracking sufficient to mark a position Hired at the agreed point.
- Position-level hold/resume; request-level hold/resume.
- Dashboard cards, filters, ageing, charts/summary, drill-down and My Actions.
- Reporting period selector including Indian financial year (1 April–31 March).
- Comments and chronological activity timeline.
- Admin workflow builder and access management.
- Notifications (initially in-app and email).
- Audit logs, exports and privacy operations.
- Retention and deletion controls for candidate data.
- Versioned legal notices, terms of use, disclaimers and acknowledgement records.
- Detailed Admin-only operational/audit log for user activity, workflow events, configuration changes, errors and security-relevant events.

## 2.5 Out of scope for the initial release

- Job-board publishing or sourcing.
- Full applicant tracking system features.
- Interview calendar and interview panel scheduling.
- Payroll, attendance, HRMS or performance management.
- Automated resume ranking or AI candidate scoring.
- Automated rejection or hiring decisions.
- Automated offer-letter generation.
- WhatsApp API integration unless approved as a later phase.
- Complex multi-entity HR or payroll accounting.
- Candidate-facing job portal.
- AI, conversational dashboard, resume parsing/summarisation, candidate scoring/ranking, scheduled escalation automation and unapproved third-party processing of candidate data.

## 2.6 Facilities

The following must be seeded as editable facility records, not hard-coded into screens:

1. Hadapsar RedWing
2. Service RedWing
3. Service BigWing
4. Izeil office
5. BigWing Sales
6. Fursungi
7. Wadki
8. ESD Godown
9. HP Salunke Vihar

The Admin can rename, deactivate or add facilities. Deactivation must not delete historical records. A facility cannot be physically deleted if referenced by historical requests.

## 2.7 Stakeholders

- **Admin:** sole system administrator; configures users, permissions, workflow and system settings.
- **Owner:** business oversight, vacancy and candidate decisions, ability to hold/resume any request or position within the business.
- **CEO:** business oversight, vacancy and candidate decisions, ability to hold/resume any request or position within the business.
- **HR Team:** manages sourcing, candidate records, candidate documents, status updates and joining outcomes.
- **Finance Team:** sees compensation details and performs budget/compensation review if enabled by the configured workflow.
- **Employee / Requester:** raises requests and views appropriate progress and clarification requests.
- **Manager / Approver:** may be a user assigned an approver permission. The initial role list may be kept to six roles; manager approval can be granted to designated users through permissions instead of adding a seventh role.

## 2.8 Business rules

1. Every vacancy request has a unique, immutable request ID.
2. The request's `requested_quantity` is not itself the live hiring status; each headcount unit has its own position record.
3. Candidate count and position count must never be conflated. Three candidates for one position remain one position.
4. Vacancy approval and candidate approval are separate decisions.
5. A candidate rejection does not automatically mean the vacancy is rejected or closed. HR may return the position to sourcing.
6. A vacancy request can be rejected before recruitment begins. Record the rejection reason and approver.
7. Owner, CEO and Admin can hold/resume any position or entire request, subject to authentication and audit logging.
8. A hold records reason, actor, timestamp, scope and optional review date. It preserves the previous active status.
9. When resumed, the position returns to its previous active status by default, unless the authorized user selects another permitted transition.
10. The system must record every status change, approval, rejection, return, hold, resume, closure, override and material field change.
11. A candidate cannot be sent for approval until the required resume and photograph are present, unless a specifically authorized exception is used and audited.
12. A material change to approved vacancy attributes (e.g., facility, title, headcount, salary range or incentives) must follow configurable re-approval rules.
13. “Hired” must follow the client's selected definition. Recommended default: candidate has actually joined, not merely accepted an offer.
14. Closing a request with unfilled positions is allowed only through an authorized action with a reason; unfilled positions must be cancelled/closed individually or through an explicit bulk action that records affected positions.
15. Dashboard counts and drill-down results must use the same filters and permission rules.
16. Financial-year reporting follows 1 April to 31 March.
17. Workflow changes are versioned. Existing requests retain the workflow version under which they started unless an Admin explicitly migrates them.
18. Security and privacy controls cannot be bypassed by workflow configuration.
19. The Admin may configure business steps and transitions, but cannot disable audit logging or server-side authorization.
20. Only authorized users may access candidate resumes, photos and contact information.

## 2.9 BRD acceptance criteria

- An authorized employee can submit a valid request from mobile or desktop.
- An authorized approver can approve, reject or return a request with a timestamp and recorded decision.
- An approved request creates exactly the requested number of position records.
- Each position can move independently through the workflow.
- A candidate cannot be sent for approval without the mandatory attachments, unless a logged exception is permitted.
- The Owner or CEO can place any request or individual position on hold and later resume it.
- Dashboard cards drill down to a permission-filtered list of records.
- My Actions shows tasks waiting for the current user.
- The Admin can change standard workflow configuration without modifying application source code.
- Workflow configuration changes do not silently corrupt in-progress requests.
- Candidate files are private and unauthorized file access is blocked.
- A documented restore test, privacy notice, retention policy and breach response procedure exist before production use.

---

# 3. Product Requirements Document (PRD)

## 3.1 Product experience principles

- **Simple first:** prioritize request entry, actions waiting for a user, and the position list.
- **One source of truth:** no hidden spreadsheets or duplicate stage tracking.
- **Position-level accuracy:** headcount is tracked per position, not just at request level.
- **Configurable, not code-dependent:** business workflow rules are stored as configuration and validated server-side.
- **Auditable:** critical actions are append-only history events.
- **Privacy by design:** collect only necessary data, restrict access and delete data when no longer required.
- **Mobile responsive:** forms, tables, candidate capture and approvals work on mobile.
- **No AI dependency:** the core app works without an AI service.

## 3.2 Primary navigation

1. Dashboard
2. Vacancy Requests
3. My Actions / My Approvals
4. On Hold
5. Closed Requests
6. Admin Panel (Admin only)

The dashboard may show context-aware widgets based on permissions. Navigation items should not be shown to users without access, but server-side authorization is still mandatory.

## 3.3 User journeys

### Journey A — raise a vacancy request

1. User signs in.
2. Opens “New Vacancy Request”.
3. Selects facility, position title, reason, salary range, incentives range and quantity.
4. Requester identity is populated from the authenticated account.
5. User enters optional notes and any configured required fields (e.g., priority and required-by date).
6. System validates the form.
7. User submits.
8. System generates request ID, timestamps the submission, creates the approval task and notifies the configured approver.
9. Requester sees the request and its current approval status.

### Journey B — approve a vacancy

1. Approver sees a task in My Actions.
2. Opens the request, reviews fields and notes.
3. Chooses Approve, Reject or Return for Clarification, subject to permissions and workflow rules.
4. Rejection/return requires a reason.
5. System logs the decision and notifies the requester and HR.
6. If approved, create one position record per requested headcount unit and make the positions available to HR.

### Journey C — HR manages candidate(s)

1. HR opens a position.
2. Sets the position to HR Searching / Sourcing.
3. Adds one or more candidate records.
4. Captures or uploads candidate photograph and uploads resume.
5. Enters candidate name, contact details, HR notes and any permitted candidate-submission fields.
6. Reviews documents and sends candidate for approval.
7. System validates mandatory documents and fields.
8. System creates an approval task and notifies the designated approver.
9. Approver can approve, reject or mark Maybe / Further Review. Rejection requires a reason.
10. If rejected, the candidate decision is recorded; the position may return to HR Searching.
11. If approved, HR follows the configured offer/joining steps.
12. When the agreed hire condition is met, the position is marked Hired.

### Journey D — Owner/CEO places a position or request on hold

1. Owner/CEO opens a request or position.
2. Selects “Put on Hold”.
3. Chooses whether the action applies to one position or the entire request.
4. Enters a mandatory reason and optional review date.
5. System records prior status, actor, timestamp and hold scope.
6. The affected position(s) appear in the On Hold view; relevant users are notified.
7. Authorized user resumes the position/request. Prior status is restored by default and the action is logged.

### Journey E — CEO uses dashboard

1. CEO selects a reporting period.
2. Sees current summary, pending actions, overdue decisions, aged positions and facility breakdown.
3. Clicks a card, number or chart segment.
4. A side panel or mobile full-screen panel opens with the filtered positions/requests.
5. CEO opens a record and takes an authorized action.
6. Returning to the dashboard preserves filters and reporting context.

### Journey F — Admin changes workflow

1. Admin opens Admin Panel → Workflow Settings.
2. Creates a draft workflow version.
3. Adds/reorders steps, configures transitions, role/user permissions, required fields, approvers, reminders and thresholds.
4. Runs validation; system warns about unreachable stages, missing approvers, missing terminal outcomes and invalid transition paths.
5. Admin previews the workflow with sample cases.
6. Admin publishes the version.
7. New records use the new version by default. Existing records retain their version unless explicitly migrated.
8. Publication and all subsequent overrides are audited.

## 3.4 Vacancy request form

### Required fields

- Request ID: system-generated, immutable.
- Location/facility: selected from active facility list.
- Request raised by: authenticated user, not manually editable.
- Position / vacancy title.
- Reason: New, Replacement, Left (client should confirm whether “Left” means employee already left; consider replacing with New / Replacement—employee left / Replacement—planned exit).
- Salary minimum and maximum.
- Incentive minimum and maximum; allow zero if no incentive applies.
- Number of positions: positive whole number.
- Notes / justification: optional unless configured otherwise.

### Recommended additional fields

- Priority: Normal / Urgent.
- Required-by date.
- Department/team, if useful.
- Replacement employee name or employee reference, if permitted and necessary; avoid storing unnecessary employee personal data.
- Budget confirmation / Finance review status if enabled.

### Validation

- Min salary <= max salary.
- Min incentives <= max incentives.
- Currency is INR by default.
- Quantity is a positive integer within an Admin-configurable limit.
- Facility must be active.
- User must have permission to submit for that facility.
- Request ID is generated on the server.
- Prevent duplicate submission on double-click/retry using an idempotency mechanism where appropriate.

## 3.5 Position and candidate model

A vacancy request for five people creates five distinct position records. Each position can have its own status, candidate submissions, ageing, hold and hire outcome.

Each position can have multiple candidates. Candidate data is stored separately from the position so one candidate can be rejected without losing the position, and candidate history remains available to authorized users.

### Candidate fields

Minimum recommended fields:

- Candidate ID (generated).
- Candidate name.
- Contact number and/or email, only as needed for recruitment.
- Position ID and facility inherited from the position.
- Resume file reference and metadata.
- Photograph file reference and metadata.
- Candidate submission status and decision.
- HR notes/recommendation.
- Proposed compensation, if applicable.
- Created/updated timestamps and responsible HR user.
- Notice/consent record or other documented processing basis as confirmed by legal review.
- Retention/deletion status and relevant timestamps.

Do not require Aadhaar, PAN, bank details, home address, date of birth or other high-risk data unless a clearly defined and lawful need exists. The initial tracker should not collect them.

### Mandatory attachment rule

Before “Send for Approval”:
- Resume must exist and pass file validation.
- Candidate photo must exist and pass file validation.
- The logged-in user must have permission to submit the candidate.
- The file must be stored in private storage.
- The system must record attachment IDs, uploader, upload timestamp and file metadata.
- An exception must be a separate, permission-restricted, reason-required, audited action.

Suggested permitted file types: PDF/DOC/DOCX for resumes and JPEG/PNG/WebP for photos. Configure maximum file size, malware scanning where available, MIME-type validation and safe filename handling. Never trust a file extension alone.

## 3.6 Workflow statuses and transitions

The application should support configurable workflow steps. Suggested initial default:

### Vacancy request lifecycle
- Draft (optional)
- Submitted / Pending Vacancy Approval
- Returned for Clarification
- Approved
- Rejected
- Closed / Cancelled

### Position lifecycle
- HR Searching
- Shortlisted
- Sent for Candidate Approval
- Maybe / Further Review
- Candidate Rejected (candidate-level decision, not necessarily position-level status)
- Approved / Proceed to Offer
- Offer in Progress (optional)
- Hired
- On Hold (hold overlay/state with previous status preserved)
- Closed Unfilled / Cancelled

Avoid mixing candidate-level decisions and position-level status. A candidate can be rejected while the position returns to HR Searching. The dashboard may show consolidated user-friendly categories, but the data model should preserve exact status and outcome.

### Workflow configurability

Admin can configure:
- Step label and internal key.
- Step type: normal, approval, terminal, hold overlay.
- Allowed inbound/outbound transitions.
- Allowed roles/users/facilities.
- Required fields and required attachments at each step.
- Whether a comment/reason is mandatory.
- Approver selection: named users, role/group, facility-specific approver.
- SLA/ageing threshold.
- Reminder/escalation rules.
- Whether a step is available for new records only or a migration is supported.
- Dashboard category mapping.

Admin can define standard shortcuts and exceptional overrides. Overrides require a reason, permission check and immutable audit event. Security checks, privacy checks and audit logging cannot be disabled.

### Workflow validation

Before publish, warn/block when:
- A non-terminal stage has no outgoing transition.
- An approval step has no eligible approver.
- A required attachment rule is impossible to satisfy.
- No valid path reaches a terminal state.
- A role can approve its own request when self-approval is prohibited.
- A transition would bypass mandatory privacy/security checks.
- A proposed change could orphan in-progress records.

## 3.7 Hold management

- Owner, CEO and Admin can hold any position or request across the business.
- HR may hold only if granted the permission.
- Require a reason.
- Review date is recommended and may be required by policy.
- Store prior status and the hold start timestamp.
- Allow position-level hold within a multi-position request.
- Allow whole-request hold, with explicit selection/confirmation of affected positions.
- Track total hold time separately from active-stage age.
- Resuming restores the previous stage by default.
- Hold/resume actions trigger notifications and audit entries.
- On Hold view should include request ID, facility, title, affected headcount, reason, hold actor, hold date, review date, hold age and resume action.

## 3.8 Dashboard requirements

### Summary cards

- Open positions.
- Pending vacancy approvals.
- Pending candidate approvals / My Approvals.
- Shortlisted positions.
- Hired positions.
- On-hold positions.
- Closed/cancelled positions.
- Optionally Maybe / Further Review.

Avoid double-counting. The system must document whether each card counts requests, individual positions, or approval tasks. Default headcount cards count **position records**, while request cards count **request records**.

### My Actions

Show tasks assigned to the logged-in user, such as:
- Vacancy approvals.
- Candidate decisions.
- Finance/budget reviews if enabled.
- Returned requests needing correction.
- HR sourcing/attachment/joining tasks.
- Overdue approvals.
- Hold reviews.

Each action includes task type, request/position, facility, age, due date/SLA, assigned user and direct navigation to the record. Completed tasks disappear from the pending queue but remain in history.

### Ageing indicators

Track separately:
1. Total calendar age since original request submission.
2. Current-stage age since entry into the current stage.
3. Active hiring age excluding time on hold.
4. Time on hold since hold start.

Admin can configure stage-specific warning and overdue thresholds. Use text labels as well as color; never rely on color alone. Example: “Waiting 6 days · Overdue” rather than a red dot only.

### Drill-down

Every summary card and chart segment is clickable. It opens a side panel on desktop or full-screen panel on mobile with the corresponding permission-filtered list. Rows open the detailed record. Keep the user's filter and reporting context when they return.

Drill-down records must match the card's count and access rules. Use pagination or virtualized scrolling for larger result sets.

### Filters

- Facility.
- Position title.
- Request ID.
- Requester.
- HR owner.
- Current stage.
- Approval status.
- On Hold / active / hired / closed.
- Created/submitted date.
- Last updated.
- Ageing bands.
- Reporting period.

### Facility breakdown

For each facility show:
- New requests in selected period.
- Current open positions.
- Pending approvals.
- Shortlisted.
- Hired during period.
- On hold.
- Closed/cancelled.
- Aged/overdue positions.

### Reporting periods

- This week.
- This month.
- This quarter.
- Year to date (current financial year to date).
- Full financial year.
- Custom date range.

Indian financial year: 1 April to 31 March. For the current date of 14 October 2026, current FY is 1 April 2026–31 March 2027.

Metric definitions:
- **Current open positions:** current-state snapshot; not retroactively filtered by creation date.
- **Requests raised in period:** request submission timestamp within the selected range.
- **Hired in period:** hire/joining event timestamp within the selected range.
- **Average time to hire:** agreed start event to joining event for positions hired in the period.
- **Pending approvals:** current pending tasks; optionally filter by submission date.
- **Historical status at period end:** requires event history and a correct as-of calculation. Do not present current state as historical state.

## 3.9 Detail page

The vacancy request detail page should show:
- Request ID, location, title, requester, reason, requested headcount, salary/incentive range, notes, priority and required-by date.
- Vacancy approval state and approver decision.
- Individual position list and current stage.
- Candidate list per position, including document availability indicators.
- Current status, total age, active age, stage age and hold age as relevant.
- Comments and system-generated chronological activity timeline.
- Action buttons permitted for the current user.
- Related notifications/tasks.
- Relevant audit history based on permissions.

Timeline event examples:
- Request submitted.
- Request approved/rejected/returned.
- Position created.
- Candidate added.
- Resume/photo uploaded/replaced.
- Candidate sent for approval.
- Candidate approved/rejected/maybe.
- Status changed.
- Hold/resume.
- Salary/headcount changed.
- Position hired/closed.
- Workflow override used.

Users cannot edit or delete audit history. Corrections are new events that reference the corrected event where appropriate.

## 3.10 Admin Panel

### A. User Management
- Invite/create user.
- Name, work email, active/inactive state.
- Role assignment.
- Facility scope.
- Force password reset or disable account as supported by authentication provider.
- Deactivate users without deleting their historical actions.
- Avoid shared accounts.

### B. Access Management
Permission matrix for:
- View requests/positions.
- View candidate details.
- View/download resume and photo.
- View salary/incentives.
- Create requests.
- Edit own draft.
- Edit submitted request.
- Approve/reject/return vacancy request.
- Manage candidates.
- Send candidate for approval.
- Approve/reject candidate.
- Hold/resume position.
- Hold/resume entire request.
- Close/cancel/reopen position.
- Export reports.
- View audit logs.
- Configure workflow.
- Configure facilities.
- Manage users and roles.
- Manage privacy/retention settings.

Allow facility-scoped permissions and, where practical, per-user overrides. Deny by default. The Admin role is reserved to the designated system administrator. The Owner/CEO are business decision-makers but do not automatically receive system-administration rights.

### C. Workflow Settings
- Versioned workflow editor.
- Steps, transitions, approvers, required fields and attachments.
- Hold rules.
- SLA thresholds.
- Notification/escalation rules.
- Validation and preview before publishing.
- Explicit migrate-in-progress-records operation, with preview and audit.
- Protected security/privacy constraints.

### D. Facilities
- Maintain nine initial facilities.
- Add/rename/deactivate.
- Do not delete referenced facilities from history.

### E. Notifications
- In-app and email initially.
- Templates for submission, approval, rejection, candidate decision, hold/resume, overdue and closure.
- Configurable recipients and reminders.
- Avoid including resumes/photos or unnecessary candidate personal data in email messages.

### F. Audit and Privacy
- Searchable audit events.
- Retention configuration.
- Candidate data access/export/deletion request workflow.
- Document deletion status.
- Incident/breach tracking.
- Record of privacy notice version and collection/consent event, where applicable.
- Vendor/processor details and operational contacts maintained outside public UI as appropriate.

## 3.11 Role and permission starting matrix

This is a default policy; Admin can configure business permissions. Security and privacy constraints remain mandatory.

| Capability | Admin | Owner | CEO | HR | Finance | Employee |
|---|---|---|---|---|---|---|
| View all requests | Yes | Yes | Yes | Yes | Configurable | No; own/relevant only |
| Raise request | Yes | Yes | Yes | Yes | Yes | Yes |
| Approve vacancy | Configurable | Yes | Yes | Optional | Optional | No |
| Manage candidates | Yes | Configurable | View/decide | Yes | No | No |
| View resume/photo | Yes | Configurable | Authorized decisions | Yes | No by default | No |
| View salary/incentives | Yes | Yes | Yes | Yes | Yes | Configurable/limited |
| Hold/resume any request/position | Yes | Yes | Yes | Configurable | No by default | No |
| Close/cancel position | Yes | Configurable | Configurable | Configurable | No | No |
| Configure workflow | Yes | No | No | No | No | No |
| Manage users/permissions | Yes | No | No | No | No | No |
| View audit history | Yes | Relevant business history | Relevant business history | Relevant records | Relevant records | Own request history only |

Never allow a user to approve their own request if policy prohibits it. Ensure the user cannot grant themselves higher privileges.

## 3.12 Notifications and reminders

Initial notifications:
- New request → designated approver.
- Vacancy decision → requester and HR.
- Candidate submitted for approval → designated approver.
- Candidate decision → HR.
- Hold/resume → relevant requester, HR and approver.
- Position hired/closed → relevant stakeholders.
- SLA warning/overdue → assigned user and optionally escalation recipient.
- Privacy request or security incident → designated privacy/security contact.

Use in-app notifications and email initially. WhatsApp integration is a later optional phase and requires a separate vendor/privacy/cost assessment.

## 3.13 Search, exports and accessibility

- Search by request ID, position title and candidate name, subject to permission.
- Export CSV/XLSX only for authorized users.
- Candidate exports should be separately permissioned and logged.
- Exports must follow the same filters and permission rules as the UI.
- Responsive layouts and keyboard-accessible controls.
- Clear labels, visible focus states, readable contrast, accessible status text.
- Confirm before destructive or bulk actions.
- Do not rely on color alone for status.

## 3.14 Non-functional requirements

### Security
- Server-side authorization on every data access and mutation.
- Private file buckets; signed, short-lived file URLs or authenticated file proxy.
- TLS in transit and provider encryption at rest.
- MFA for Admin and preferably Owner/CEO accounts.
- Rate limiting on login, upload and sensitive endpoints.
- Secure password/authentication practices; never store plaintext passwords.
- Input validation, output encoding, CSRF protection where applicable, secure session handling.
- File type/size validation, malware scanning where available, safe download headers.
- Secrets stored in server environment/secret manager, never client-side.
- Separate development, staging and production environments.
- No production candidate data in development/testing environments.
- Regular dependency updates and security review.

### Reliability
- Automated backups on production.
- Documented recovery point and recovery time expectations.
- Scheduled restore tests.
- Error logging and monitoring without unnecessarily logging candidate personal data.
- Data export and migration path.
- Idempotent actions for critical submissions where practical.

### Performance
- Dashboard loads promptly for normal business volumes.
- Paginate larger tables.
- Index common filters (facility, status, created date, stage timestamp, assigned approver).
- Store files in object storage, not as database blobs.
- Use server-side aggregation for dashboard counts.

### Maintainability
- Workflow configuration stored as data, not embedded in UI code.
- Schema migrations tracked in source control.
- Audit events append-only.
- Automated tests for role permissions, transitions, headcount, ageing and privacy rules.
- Document provider configuration and deployment.

---

# 4. Data Model / Database Design

The following is a logical schema, not final SQL.

## 4.1 Core tables

Include dedicated, append-only audit/event tables for business history and operational/security logs. Keep sensitive document contents out of logs; link to record IDs only.

### `users`
- `id`
- `auth_provider_user_id`
- `full_name`
- `work_email`
- `role_id` or role assignment relation
- `is_active`
- `created_at`, `updated_at`, `deactivated_at`

### `roles`
- `id`
- `name` (Admin, Owner, CEO, HR Team, Finance Team, Employee)
- `description`

### `permissions`
- `id`
- `permission_key`
- `description`

### `role_permissions`
- `role_id`
- `permission_id`
- `allowed`

### `user_permission_overrides`
- `user_id`
- `permission_id`
- `allowed`
- `reason`
- `created_by`
- `created_at`

### `user_facility_access`
- `user_id`
- `facility_id`
- `access_level`

### `facilities`
- `id`
- `name`
- `is_active`
- `created_at`, `updated_at`, `deactivated_at`

### `vacancy_requests`
- `id`
- `request_number`
- `facility_id`
- `requested_by_user_id`
- `position_title`
- `reason_code`
- `salary_min`, `salary_max`
- `incentive_min`, `incentive_max`
- `requested_quantity`
- `priority`
- `required_by_date`
- `notes`
- `request_status`
- `approval_status`
- `workflow_version_id`
- `submitted_at`
- `approved_at`
- `closed_at`
- `closure_reason`
- `created_at`, `updated_at`

### `positions`
- `id`
- `position_number`
- `vacancy_request_id`
- `facility_id` (denormalized only if justified; otherwise derive through request)
- `position_status`
- `previous_status_before_hold`
- `assigned_hr_user_id`
- `current_stage_entered_at`
- `hold_started_at`
- `hold_reason`
- `hold_review_date`
- `hired_at`
- `closed_at`
- `closure_outcome`
- `closure_reason`
- `created_at`, `updated_at`

### `candidates`
- `id`
- `position_id`
- `candidate_name`
- `phone`
- `email`
- `candidate_status`
- `hr_recommendation`
- `proposed_salary`
- `proposed_incentives`
- `created_by_user_id`
- `created_at`, `updated_at`
- `privacy_notice_version_id`
- `privacy_notice_shown_at`
- `processing_basis_record`
- `retention_due_at`
- `deletion_status`

### `candidate_documents`
- `id`
- `candidate_id`
- `document_type` (resume, photograph, other explicitly permitted type)
- `storage_provider`
- `bucket_name`
- `object_key`
- `original_filename` (sanitized)
- `mime_type`
- `size_bytes`
- `checksum` (if supported)
- `uploaded_by_user_id`
- `uploaded_at`
- `replaced_at`
- `deleted_at`
- `malware_scan_status`

Do not store publicly accessible URLs as the source of truth. Store object keys and generate authorized temporary access URLs when required.

### `approval_tasks`
- `id`
- `task_type`
- `vacancy_request_id` (nullable)
- `position_id` (nullable)
- `candidate_id` (nullable)
- `assigned_user_id` or `assigned_role/group`
- `status`
- `due_at`
- `completed_by_user_id`
- `completed_at`
- `decision`
- `decision_reason`
- `created_at`

### `workflow_definitions`
- `id`
- `name`
- `version_number`
- `status` (draft, published, retired)
- `created_by`
- `published_by`
- `published_at`
- `created_at`

### `workflow_steps`
- `id`
- `workflow_definition_id`
- `step_key`
- `label`
- `step_type`
- `required_fields_config`
- `required_documents_config`
- `sla_threshold_hours`
- `dashboard_category`
- `is_terminal`

### `workflow_transitions`
- `id`
- `workflow_definition_id`
- `from_step_id`
- `to_step_id`
- `allowed_roles_or_permissions`
- `requires_reason`
- `requires_approval`
- `is_shortcut`
- `is_override_only`

### `activity_events`
- `id`
- `entity_type`
- `entity_id`
- `event_type`
- `actor_user_id`
- `timestamp`
- `previous_value` (careful to avoid copying excessive personal data)
- `new_value`
- `reason`
- `metadata` (minimal and validated)

### `comments`
- `id`
- `entity_type`
- `entity_id`
- `comment_text`
- `created_by_user_id`
- `created_at`
- `edited_at` (if editing is allowed; keep edit history)

### `notifications`
- `id`
- `recipient_user_id`
- `notification_type`
- `related_entity_type`
- `related_entity_id`
- `read_at`
- `created_at`

### `legal_documents` / `privacy_notices`
- `id`
- `version`
- `notice_text`
- `language`
- `effective_from`
- `created_by`

### `legal_document_acknowledgements`
- `id`
- `user_id`
- `document_id`
- `document_version`
- `acknowledged_at`
- `acknowledgement_type` (accepted / acknowledged / consent, as applicable)
- `source` (web/app/admin-recorded candidate notice delivery)
- `metadata` (minimized; no sensitive content)

### `candidate_notice_events`
- `id`
- `candidate_id`
- `notice_document_id`
- `notice_version`
- `delivery_method`
- `delivered_at`
- `recorded_by_user_id`
- `candidate_response` (only where relevant and actually obtained)
- `lawful_basis_reference` (approved configuration/reference; not an unreviewed legal conclusion)

### `privacy_requests`
- `id`
- `candidate_id` or verified subject reference
- `request_type` (access, correction, deletion, withdrawal/objection where applicable)
- `received_at`
- `status`
- `assigned_to`
- `resolved_at`
- `resolution_notes`

### `security_incidents`
- `id`
- `reported_at`
- `incident_type`
- `severity`
- `affected_data_categories`
- `containment_actions`
- `notification_assessment`
- `resolved_at`
- `owner_user_id`

## 4.2 Data integrity rules

- Unique request number and position number.
- Every position belongs to one request.
- Created position count matches approved quantity unless an explicit audited adjustment is made.
- A request quantity change after positions exist must trigger an explicit workflow (add positions, cancel positions or re-approve), not silently rewrite records.
- Every approval task has one clear target and assignee/eligible group.
- No hard delete of requests, positions, approval events or audit events through normal UI.
- Candidate data deletion must remove or irreversibly anonymize associated personal data and file objects where required, while retaining only records that can lawfully be retained. Seek legal review for conflicts between deletion and legitimate recordkeeping.
- All timestamps stored in UTC and rendered in Asia/Kolkata.
- Store the financial-year period logic in one tested reporting utility.
- Use decimal/numeric types for money, not floating-point types.

---

# 5. Technical Provider Recommendation

## 5.1 Recommended starting stack

### Recommended practical option: Supabase
Use Supabase for:
- PostgreSQL database.
- Authentication.
- Row-Level Security (RLS) where applicable.
- Private Storage for resumes and photographs.
- Database migrations and structured queries.

Why:
- One integrated service reduces setup and operational complexity.
- PostgreSQL is well suited to relational vacancy, position, candidate, approval and audit data.
- Private Storage can use access policies and signed URLs.
- Free tier is useful for a prototype.
- Paid Pro plan offers a more appropriate production starting point, including backups and higher quotas.

Official references:
- Supabase pricing: https://supabase.com/pricing
- Billing and quotas: https://supabase.com/docs/guides/platform/billing-on-supabase
- Storage pricing: https://supabase.com/docs/guides/storage/pricing

Current pricing snapshot (check before purchase):
- Free: $0; 500 MB database per project, 1 GB file storage, limited egress; free projects may pause after a period of inactivity and automatic backups are not included.
- Pro: listed at US$25/month for the organization/first project configuration; includes 100 GB file storage and 8 GB database disk per project, plus daily backups with 7-day retention, subject to plan details and usage limits.
- Additional projects/compute and overages can increase the bill. Do not assume the base price covers multiple production environments.

**Recommendation:** use Free only for design/prototype/testing with synthetic data. Before live candidate data, use a paid production plan or another production setup with equivalent controls, backups and recovery testing. Set budget alerts and review actual usage.

## 5.2 Alternative: Supabase database + Cloudflare R2 file storage

Use PostgreSQL/Supabase for structured data and Cloudflare R2 for candidate documents if:
- File volume grows.
- Low-cost object storage and zero egress fees are important.
- The team is comfortable implementing and testing a separate secure file-storage integration.

Cloudflare R2 current published Standard pricing includes a recurring monthly free usage allowance (not unlimited free storage):
- 10 GB-month free storage.
- 1 million Class A operations/month included.
- 10 million Class B operations/month included.
- No egress charges.
- Published Standard storage rate: US$0.015 per GB-month beyond free allowance.
- Operation pricing may apply beyond free limits.

Official references:
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/get-started/

Important implementation details:
- Keep the R2 bucket private.
- Never expose permanent public object URLs for candidate files.
- Generate short-lived signed URLs server-side after checking authorization, or proxy file access through an authenticated backend.
- Store object keys, not public links, in PostgreSQL.
- Apply least privilege to API tokens.
- Implement lifecycle/deletion controls and backups/export strategy.
- Confirm the storage region, subprocessors, contractual terms and transfer arrangements are acceptable for the client's legal/privacy position.

## 5.3 Alternative: Neon PostgreSQL + R2

Neon is a managed PostgreSQL option with a generous free tier for development and usage-based paid tiers. It can be paired with R2 for documents. It requires more integration work than an all-in-one Supabase setup, especially for authentication, permissions and file policies.

Official references:
- https://neon.com/pricing
- https://developers.cloudflare.com/r2/pricing/

Use this option only if the implementation team is comfortable assembling and maintaining the additional services. Do not choose it merely because the free database quota looks larger.

## 5.4 Provider decision

**Default recommendation for the first production release:** Supabase Pro with private Supabase Storage, provided the chosen project region, contractual terms, backup configuration and privacy requirements are acceptable. This is the simplest way to reduce integration work.

**Cost-optimized alternative:** Supabase PostgreSQL/Auth + private Cloudflare R2 for documents. Consider this if attachment volume grows and a separate storage integration is justified.

Do not assume any provider is automatically “DPDP compliant” simply because it has encryption or certifications. Yash Honda's legal role, notices, lawful basis, access policy, retention, vendor contract, security operations and user-rights process still matter.

## 5.5 Region, data transfer and vendor due diligence

Before selecting the final region/provider, verify:
- Current availability of the desired India region for the selected services.
- Whether data or backups are stored/transferred outside India.
- Current provider data processing terms and subprocessor list.
- Security incident notification terms.
- Deletion and backup expiration behaviour.
- Access logging, encryption and key management options.
- Whether the provider's terms permit this use.
- Applicable government restrictions or sector-specific obligations.

The DPDP framework does not create a simple blanket rule that all personal data must always be hosted in India; however, transfer restrictions and other laws/orders may apply. Confirm the actual legal position at launch and choose an India region if available and suitable, particularly to reduce data-transfer complexity.

## 5.6 Cost controls

- Start with one production database project and a separate development project.
- Do not create many always-on production projects without budgeting for them.
- Configure billing alerts, quota alerts and a monthly cost review.
- Limit uploaded file size and permitted types.
- Compress photographs when appropriate without damaging the source resume.
- Do not keep duplicate files when replacing a document; use versioning/retention rules.
- Define retention to prevent indefinite storage of old candidate documents.
- Use database indexes and pagination rather than over-provisioning compute.
- Test backups and recovery before launch.
- Avoid putting resumes/photos into database blobs or public web assets.

---

# 6. DPDP Act and Candidate Privacy Requirements

## 6.1 Do we need to consider DPDP?

**Yes. Design for compliance before storing real candidate data.** The app will process identifiable digital personal data, including candidate names, contact details, resumes, photographs, qualifications and recruitment decisions.

The Digital Personal Data Protection Act, 2023 and Digital Personal Data Protection Rules, 2025 establish India's framework for digital personal data. The Government announced a phased implementation timeline in November 2025. Not every provision necessarily becomes enforceable on the same date; check the official commencement timeline and current legal advice before launch.

Official sources:
- MeitY DPDP Rules and enforcement timeline: https://www.meity.gov.in/
- PIB, Government notifies DPDP Rules (14 November 2025): https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014
- DPDP Act, 2023: available through the Ministry of Electronics and Information Technology / Gazette of India.

This document is a product and engineering plan, not legal advice or a certification of compliance. Yash Honda should have an Indian privacy/legal professional validate the lawful basis, notices, retention policy, contracts and operational obligations before production use.

## 6.2 Who is responsible?

The likely operating model is:
- **Yash Honda / the relevant legal business entity:** determines why candidate data is collected and how it is used; likely acts as the Data Fiduciary under the DPDP framework, subject to legal confirmation.
- **Swaniki / developer or hosting provider:** may act as a Data Processor when handling data on Yash Honda's documented instructions, depending on actual arrangements.
- **Hosting, storage and any enabled communication vendors:** may be processors/sub-processors or independent parties depending on their terms and data use.

Use a written data-processing/service agreement with Yash Honda. Define purpose, instructions, confidentiality, security controls, subprocessors, breach escalation, deletion/return of data, support access and audit cooperation. Review each provider's terms rather than assuming the technical setup determines the legal roles.

## 6.3 Privacy-by-design requirements

### A. Collection notice and consent / lawful basis
- Show a short, clear candidate privacy notice when candidate information is collected or entered into the system, and provide a way to give the candidate the full notice.
- Explain what is collected: contact details, resume, photograph and recruitment-related notes/decisions.
- Explain why: evaluate and manage the candidate for the specified vacancy and communicate about recruitment.
- Identify the responsible organization and a contact for privacy questions/grievances.
- Explain applicable rights and how to submit access, correction or deletion requests.
- Explain retention at a useful level and how withdrawal/requests are handled, where applicable.
- Keep a versioned record of the notice shown and the collection event.
- Obtain and record consent where consent is the appropriate lawful basis; confirm the correct basis and notice wording with legal counsel. Do not assume a generic checkbox alone makes every processing activity lawful.
- Candidate data must not be reused for unrelated purposes or shared with unapproved third parties.

### B. Data minimization
- Collect only data required for recruitment.
- Do not collect Aadhaar, PAN, bank details, sensitive family details, home address or date of birth in the initial tracker unless a clear, lawful necessity is documented.
- Do not use photographs for automated appearance, personality, emotion or suitability analysis.
- Avoid recording subjective, irrelevant or discriminatory comments.
- Keep candidate data separate from general activity logs; audit logs should not duplicate full resumes, phone numbers or unnecessary personal information.

### C. Access controls
- Default deny.
- HR can access candidates assigned to the permitted facilities/positions.
- Owner/CEO can access candidate details needed for a decision.
- Finance does not get resume/photo access by default; only compensation/budget fields if required.
- Employees/requesters do not see candidate resumes/photos by default.
- Admin access is restricted and logged; do not use administrative access casually.
- MFA for Admin and privileged users.
- Revoke access promptly when a user leaves or changes role.
- Test that a user cannot access a document by guessing its URL or changing an ID.

### D. File security
- Private buckets only.
- No public resume/photo URLs.
- Short-lived signed URLs or authenticated download endpoints.
- Authorization check on every file download.
- Validate actual MIME type, file extension and size.
- Scan for malware where available; quarantine suspicious files.
- Safe filenames and download headers.
- Encrypt data in transit and at rest using provider capabilities.
- Do not send attachments in email notifications.
- Do not log file contents or signed URLs in application logs.
- Keep document access/download audit events where feasible and proportionate.

### E. Retention and deletion
- Define a written retention period with legal/business input. Do not keep unsuccessful candidates indefinitely by default.
- Make retention configurable by candidate outcome and purpose.
- Store a `retention_due_at` date and show an Admin retention queue.
- Provide an approved deletion/anonymization workflow for expired candidate records and related file objects.
- Include backup expiration in the deletion plan; explain that backup copies may persist until their scheduled expiry, where relevant.
- Retain only the minimum non-identifying or legally required record after deletion, subject to legal review.
- A deletion request should be reviewed against any applicable legal retention requirement; record the decision and reason.
- Provide a documented process to handle candidate requests for access, correction, erasure and other applicable rights.
- Do not delete required audit events in a way that breaks integrity; instead minimize personal data in those events and apply a legally reviewed retention approach.

### F. Accuracy and fairness
- Allow authorized HR to correct inaccurate candidate data.
- Keep change history for significant edits.
- Do not automate hiring decisions using AI.
- Do not infer sensitive characteristics or use protected characteristics in candidate scoring.
- Ensure candidates can raise a correction request through the published contact channel.

### G. Security incident response
- Establish a written incident response process before launch.
- Define who receives reports, who investigates and who decides notifications.
- Log suspected access, exfiltration, lost credentials, exposed links and unauthorized downloads.
- Have a process to contain the incident, revoke credentials/signed links, preserve evidence, assess scope and notify the client.
- Follow the legally applicable breach notification requirements and timelines in force at the time. Do not hard-code legal timing based on assumptions; keep the procedure configurable and have counsel validate it.
- Maintain a breach/incident register and record remediation.

### H. Vendor and transfer controls
- Review service terms, privacy policy, data processing terms, sub-processors, location, backup location and transfer arrangements.
- Use least-privilege vendor credentials.
- Do not provide provider support staff with broad candidate access unless necessary and controlled.
- Confirm whether any selected provider retains or reuses data, and obtain legal approval before enabling any new third-party processing.
- Maintain a list of vendors that can access personal data.

## 6.4 Candidate privacy notice template — draft for legal review

**Candidate Privacy Notice — Yash Honda Hiring**

Yash Honda collects and uses the personal information you provide, such as your name, contact details, resume, photograph and information relevant to your application, to review your suitability for the vacancy you are being considered for, manage the recruitment process and communicate with you about your application.

Your information will be accessible only to authorized personnel and service providers who need it for these purposes. We do not intend to use your photograph for automated appearance, personality or suitability scoring. We will retain your information only for the period defined by our recruitment and record-retention policy, subject to applicable legal requirements.

For questions or requests concerning your personal information, including correction or deletion where applicable, contact: **[insert verified Yash Honda privacy contact/email/phone]**.

Before this notice is used, legal counsel must finalize:
- The exact legal entity name and contact.
- The appropriate lawful basis and consent mechanism, if required.
- Retention periods and treatment of unsuccessful applicants.
- Applicable rights and grievance process.
- Language versions required for the intended candidate population.
- How candidates who withdraw or do not proceed are handled.

Do not deploy with placeholder contact details. Keep each notice version and record when it was shown.

## 6.5 DPDP implementation checklist

Before live launch, complete and sign off:
- [ ] Confirm legal entity and Data Fiduciary / Processor roles.
- [ ] Legal review of privacy notice, collection basis and candidate photo purpose.
- [ ] Candidate-facing notice and contact channel are live.
- [ ] Retention schedule is approved and configured.
- [ ] Candidate access/correction/deletion request process is tested.
- [ ] Private storage and server-side authorization are tested.
- [ ] RLS/authorization tests cover every role and facility.
- [ ] MFA is enabled for privileged accounts.
- [ ] Backups and restore test completed.
- [ ] Incident response and breach escalation process documented.
- [ ] Vendor terms, regions and sub-processors reviewed.
- [ ] Data processing/service agreement signed.
- [ ] Production secrets and environment separation verified.
- [ ] Security review and file-upload tests completed.
- [ ] No production candidate data used in development/demo.
- [ ] Legal review confirms applicable commencement dates and obligations.

---

# 7. Legal Documents, User Acknowledgements and Operational Logs

## 7.1 Required legal/privacy pages inside the application

Provide a Legal & Privacy area accessible from the login page and application footer, with the current version of each document and its effective date. The Admin must be able to update approved wording, publish a new version, and preserve previous versions for audit purposes.

Required documents:
1. **Terms of Use** — permitted use, account responsibility, confidentiality, acceptable use, prohibited sharing of candidate data, suspension/deactivation and support contact.
2. **Privacy Notice for Internal Users** — what account and usage data is collected, why it is processed, who can access it, applicable rights/request channel, retention, security contact and the responsible Yash Honda legal entity.
3. **Candidate Privacy Notice** — shown or made available to candidates when HR collects their information; explains the recruitment purpose, data categories, internal recipients, storage/retention approach, privacy contact and applicable rights.
4. **Disclaimer** — the tracker is an internal administrative aid; status labels and dashboard figures depend on timely and accurate user inputs; it does not guarantee hiring outcomes or replace management decisions, legal advice or HR judgement. It must not attempt to waive rights that cannot legally be waived or exclude liability where prohibited by law.
5. **Acceptable Use & Confidentiality Rules** — candidate documents and contact details are confidential; users must not download, forward, photograph, reuse or disclose them outside authorized recruitment purposes.
6. **Data Retention and Deletion Summary** — plain-language overview of how long recruitment records are retained, how deletion requests are handled and when legal/business retention requirements may apply.
7. **Privacy Request / Grievance Contact** — verified contact details and a simple process to raise a question, correction request, deletion request or grievance.

These are draft product requirements, not final legal wording. Do not publish placeholder legal entity names, addresses, email addresses, retention periods or grievance contacts. Yash Honda must approve the final documents with qualified Indian legal/privacy counsel before production use.

## 7.2 Registration, login and acknowledgement flow

- Use invited/authorized internal accounts rather than an unrestricted public registration page, unless the client explicitly approves open registration.
- On first sign-in, show the current Terms of Use and Internal User Privacy Notice.
- Require an affirmative acknowledgement checkbox and action before continuing where legally and operationally appropriate. Do not pre-tick the checkbox.
- Store the authenticated user ID, document type, exact document version, publication/effective date, acknowledgement timestamp, and the relevant event metadata.
- If a material document is updated, require re-acknowledgement before further use when the Admin/legal advisor marks it as required. Preserve the previous acknowledgement record.
- Do not describe a general “disclaimer” as blanket consent for all personal-data processing. Explain the purposes clearly and record consent only where consent is the appropriate legal basis.
- Candidate information is different from internal user account data. HR must provide the Candidate Privacy Notice to the candidate at collection or through the client-approved channel and record when/how it was provided.
- If the client/legal advisor determines that consent is the appropriate basis for a particular candidate-processing activity, record the affirmative consent event, notice version, timestamp and collection method. Provide a workable way to withdraw consent where applicable and explain consequences; do not make consent the default legal basis without review.
- If HR enters a candidate's details before the candidate is directly interacting with the app, the system must let HR record the notice delivery method/date and the candidate's response where relevant. Never falsely record that a candidate personally accepted terms if HR merely uploaded their resume.
- Do not collect Aadhaar, PAN, bank details or unrelated personal information in this tracker.

## 7.3 Candidate photo safeguard

The current business requirement asks for a candidate photograph before submission for approval. Before launch, Yash Honda must confirm that this is necessary and proportionate for the recruitment purpose and approve the notice wording and access restrictions. If retained:
- explain the photo collection purpose in the Candidate Privacy Notice;
- restrict access to authorized HR and decision-makers;
- do not use it for appearance, personality, demographic or suitability scoring;
- do not expose it through public links, general activity logs or email notifications;
- apply the same retention/deletion controls as other candidate documents.

## 7.4 Detailed Admin operational log

The Admin Panel must include a dedicated **System & Audit Log** with searchable, filterable entries. It must make routine background activity understandable to a non-technical administrator without exposing secrets or unnecessary candidate information.

Log at least:
- authentication events: successful/failed sign-in, sign-out, account invitation, activation/deactivation, password/MFA changes where available, session revocation;
- authorization/security events: denied access, permission failures, attempted access to unauthorized candidate documents, repeated failed actions and rate-limit/security events;
- business events: vacancy request created/edited/submitted, approval/rejection/return, position created, candidate added/updated, document uploaded/replaced/deleted, candidate sent for approval, decisions, hold/resume, hired/closed/cancelled;
- configuration events: role/permission changes, facility changes, workflow edits/publishing/version changes, approver changes, legal document publication, retention policy changes and system settings;
- privacy events: notice displayed/acknowledged, candidate notice delivery recorded, consent/withdrawal event where applicable, privacy request opened/resolved, retention/deletion run and deletion exceptions;
- operational events: upload failures, notification delivery failures if notifications are enabled, background job failures if any, database/storage errors and backup/restore test results entered by an administrator;
- exports and downloads: who exported records, filter/scope, time, outcome and a reason for sensitive bulk exports where configured.

Each log event should contain a unique event ID, timestamp in UTC (displayed in Asia/Kolkata), actor/service identity, event category, action, target record type/ID, outcome, correlation/request ID where available, and a safe summary. For state changes, record the before/after values for relevant non-sensitive fields and the reason where required.

**Security and integrity requirements**
- Audit records are append-only for normal users and cannot be edited/deleted through the UI, including by the Admin. Corrections must be new events.
- Restrict the detailed log to Admin; provide only relevant record history to other roles according to their permissions.
- Never log passwords, authentication tokens, API keys, full resumes, photographs, full candidate contact details or document contents.
- Avoid storing unnecessary personal data in error messages. Redact sensitive values and sanitize user-provided strings to prevent log injection.
- Do not expose stack traces, infrastructure secrets or internal paths to ordinary users. Show a safe error message and log a correlation ID.
- Keep operational logs and business audit history logically separated if needed, with retention periods based on security, legal and business requirements.
- Log access to sensitive documents where practical, including actor, candidate/document ID, action (view/download), timestamp and outcome.
- Record log retention and access policy; protect logs from unauthorized modification and include them in appropriate backups.
- The Admin must be able to search by date range, user, event category, outcome, record/request/position ID and keyword; export logs only with a logged reason and appropriate permission.
- Provide a simple status summary at the top: recent errors, failed uploads, failed notification attempts (if applicable), security events and latest backup/restore-check record. Do not imply a live infrastructure health check unless it is actually implemented.
- The log must not be used as a substitute for server monitoring, backup testing or incident response.

## 7.5 Important legal qualification

The Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025 have phased implementation. Before launch, verify which provisions and obligations are in force on the actual go-live date. Legal wording, consent/lawful basis, retention, grievance handling, vendor contracts and operational procedures require review by qualified Indian counsel. The product must not claim “DPDP compliant” solely because these features exist.

---

# 8. Master Webapp Generation Prompt

The following prompt is intended to be pasted into a webapp builder or coding agent. It defines the intended product, behavior, UX, architecture and safety constraints. It is not permission to use live candidate data during prototyping.

---

## MASTER PROMPT — BUILD YASH HONDA VACANCY & HIRING TRACKER

You are a senior product designer, enterprise workflow architect, full-stack engineer, database designer and application security engineer. Design and build a production-oriented internal web application called **Yash Honda Vacancy & Hiring Tracker**.

### A. Product goal

Build a simple, minimal, visually polished and mobile-responsive vacancy/hiring workflow tracker for Yash Honda's nine facilities. This is not a full recruitment platform or ATS. The product tracks vacancy requests, approvals, individual headcount positions, candidate submissions, candidate resume/photo attachments, decisions, holds, ageing, pending actions and hiring outcomes.

Build a straightforward, rule-based internal tracker. Do not implement AI, a conversational dashboard, resume parsing/summarisation, candidate scoring/ranking, AI-based decisions, scheduled escalation bots, or advanced automations. Do not add unrelated HRMS features.

### B. Core facilities

Seed these facilities as editable records:
1. Hadapsar RedWing
2. Service RedWing
3. Service BigWing
4. Izeil office
5. BigWing Sales
6. Fursungi
7. Wadki
8. ESD Godown
9. HP Salunke Vihar

### C. Roles and authorization

Initial roles:
- Admin (only designated system administrator)
- Owner
- CEO
- HR Team
- Finance Team
- Employee

Implement role-based access control plus facility scope and user-level permission overrides. Enforce every permission on the server/API/database layer; hiding a button is not authorization. Deny by default. A user must never grant themselves more access.

Admin can configure business permissions, users, facility scope, workflow, approvers, notification rules and ageing thresholds. Owner and CEO are business decision-makers, not automatically system administrators. Owner, CEO and Admin can hold/resume any request or position.

### D. Vacancy request form

Required:
- Request ID generated by the server.
- Facility/location.
- Request raised by, populated from authenticated account.
- Position title.
- Reason: New, Replacement, Left (allow Admin to configure options).
- Salary minimum and maximum.
- Incentives minimum and maximum.
- Number of positions.
- Notes/justification.

Recommended configurable fields:
- Priority (Normal/Urgent).
- Required-by date.

Validate salary minimum <= maximum, incentive minimum <= maximum, quantity as positive integer, active facility and user facility permission. Use INR. Do not allow client-supplied requester identity to override the logged-in identity.

### E. Separate request and position records

A request for N positions must create N individual position records after approval. Track each position independently. Do not count candidates as positions. A position can have multiple candidates. Rejecting one candidate must not automatically close the vacancy.

Request ID and position IDs are immutable and unique. If approved quantity changes, use an explicit audited workflow for adding/cancelling positions; do not silently alter existing records.

### F. Workflow

Default workflow:
1. Submit vacancy request.
2. Pending vacancy approval.
3. Approved / Rejected / Returned for clarification.
4. HR Searching.
5. Shortlisted.
6. Candidate submitted for approval.
7. Candidate decision: Approved / Rejected / Maybe or Further Review.
8. Offer/joining stage if configured.
9. Hired or Closed Unfilled/Cancelled.

Implement candidate decisions separately from position status. Candidate rejection normally returns the position to HR Searching. “Hired” defaults to the date the candidate actually joins, unless the Admin configures a different definition.

### G. Candidate submissions and documents

Every candidate sent for approval must have:
- Candidate name.
- Necessary contact information.
- Resume/CV.
- Candidate photograph.
- HR notes/recommendation.
- Position/facility.
- Relevant proposed compensation where required.

Support camera capture on a compatible device and upload from device. Camera capture is optional; upload is also allowed. Validate resume/photo presence before “Send for Approval.” Allow exceptions only to authorized roles, with a mandatory reason and audit event.

Use private file storage. Never expose permanent public URLs. Validate file size and true content type, use safe filenames, scan for malware where available, and issue short-lived signed URLs or use authenticated download endpoints. No resume/photo attachments in email notifications.

### H. Approvals and My Actions

Create a task queue with clear assignee, target record, status, age, due date and action link.

- CEO/Owner: vacancy approvals, candidate decisions, aged/overdue tasks, hold reviews.
- HR: sourcing, missing documents, returned submissions, joining updates.
- Finance: compensation/budget review only if enabled.
- Requester: clarification tasks and relevant request updates.
- Admin: all tasks and workflow administration.

Rejection and return actions require a reason. Prevent self-approval if configured. Notifications should be in-app and email initially.

### I. Hold management

Owner, CEO and Admin can put any position or request on hold. HR may do so only if permitted. Require a reason and support an optional/recommended review date. Preserve previous active stage and track hold duration separately. A request-level hold must clearly show which positions are affected. Resume returns the record to its previous stage by default. Every hold/resume action is logged and relevant users are notified.

### J. Admin workflow builder

Build a visual, versioned workflow configuration screen. Admin can:
- Add, remove, rename and reorder business steps.
- Configure permitted transitions and shortcuts.
- Configure approvers by user, role/group and facility.
- Set mandatory fields/documents at each step.
- Configure rejection/closure reasons.
- Configure role/user/facility permissions.
- Set ageing thresholds, reminders and escalation.
- Configure dashboard category mapping.
- Preview and validate a workflow before publishing.
- Publish a new workflow version.
- Explicitly migrate existing records only through a previewed and audited operation.

Validate unreachable steps, missing approvers, invalid paths, absent terminal outcomes and transitions that bypass mandatory requirements. New workflow versions apply to new records by default. Existing records retain their version unless explicitly migrated. Admin override requires a reason and immutable audit event.

Never allow workflow settings to disable authentication, server-side authorization, private file access, audit logging or legally required privacy controls.

### K. Dashboard

Create a clean dashboard with:
- Open positions.
- Pending vacancy approvals.
- Pending candidate decisions.
- Shortlisted positions.
- Hired positions.
- On-hold positions.
- Closed/cancelled positions.
- Maybe/Further Review where useful.
- Facility breakdown.
- Ageing and overdue items.
- Last-updated information.
- My Actions near the top.
- Search, sort and filters.

All numbers/cards/chart segments must be clickable. Open a side panel on desktop or full-screen panel on mobile showing the permission-filtered list represented by that number. Rows open a detailed record. The count and drill-down must use identical filtering and permission rules. Preserve filters when returning.

### L. Ageing

Track:
- Total calendar age since request submission.
- Current-stage age.
- Active hiring age excluding hold time.
- Time on hold.

Admin configures thresholds by stage. Use clear text labels plus neutral/amber/red status treatment; do not rely only on color. Show overdue approvals and positions with no recent activity.

### M. Reporting periods

Provide:
- This week.
- This month.
- This quarter.
- Year to date.
- Full financial year.
- Custom date range.

Financial year is 1 April–31 March. Use Asia/Kolkata for display and store timestamps in UTC. Clearly distinguish current-state snapshots from period activity. Hired during period uses the actual hire/joining event date. Historical “status at period end” must be derived from event history, not today's status.

### N. Detail page and activity history

Show request fields, approval decisions, individual positions, candidates, document status, current stage, ageing, comments and chronological timeline. Every important event records actor, timestamp, prior/new status and reason where relevant. Audit events are append-only from normal UI. Corrections are recorded as new events.

### O. Admin Panel

Tabs:
1. User Management.
2. Access Management.
3. Workflow Settings.
4. Facilities.
5. Legal Documents & Acknowledgements.
6. Privacy & Retention.
7. System & Audit Log.

Allow user activation/deactivation, role assignment, facility scope, permission overrides and configuration. Deactivation must not erase history. Keep privacy/retention actions restricted and audited. Legal documents must be versioned with publication date, effective date, current/archived status and a preview before publication. Show acknowledgement records by user and document version.

### O1. Detailed System & Audit Log

Build a searchable, filterable Admin-only log of business events, configuration changes, security-relevant events, privacy events and safe operational errors. Include event ID, timestamp, actor/service, category, action, target record, outcome, correlation ID and a safe summary. Capture the event categories and fields specified in Section 7.4 of this document.

Log all material changes and sensitive document view/download events where practical. Log export/download actions and permission changes. Keep the log append-only in the application; do not allow the Admin to edit or erase entries. Never log passwords, tokens, API keys, resume contents, photographs or unnecessary candidate contact details. Use correlation IDs and safe error messages instead of exposing stack traces to users. Include a small status summary for recent errors and recorded backup/restore checks, but do not claim live monitoring unless implemented.

### P. Legal documents, privacy and DPDP safeguards

The application stores candidate personal data. Build privacy-by-design and implement all legal-document/acknowledgement flows in Section 7. Required in-app documents include Terms of Use, Internal User Privacy Notice, Candidate Privacy Notice, Disclaimer, Acceptable Use & Confidentiality Rules, Data Retention and Deletion Summary, and a Privacy Request/Grievance Contact. Build versioned publication and acknowledgement records. Do not treat a generic disclaimer checkbox as blanket consent.
- Candidate privacy notice and notice-version record; record delivery method/date when HR provides the notice.
- Record consent only where consent is the appropriate lawful basis, as confirmed by the client/legal advisor; preserve evidence of the actual event.
- Candidate access/correction/deletion request process.
- Configurable retention due date and deletion/anonymization workflow.
- Private files and strict document access checks.
- Least privilege and MFA for privileged accounts.
- Audit access to sensitive documents where practical.
- No candidate data in public URLs, logs, analytics or email notifications.
- No unnecessary data collection (do not collect Aadhaar/PAN/bank details in this tracker).
- No automated candidate ranking, appearance scoring or rejection.
- Secure secrets, backups, restore tests and incident response.
- Provider and data processing agreement configuration documented.
- Include Terms of Use, disclaimers, internal-user privacy notice, candidate notice, retention/deletion summary and grievance contact; do not publish placeholders.
- Never claim “DPDP compliant” automatically; include a pre-launch legal/privacy checklist.

Do not use production candidate data in previews, tests or seed data. Use synthetic examples only.

### Q. Database and technical architecture

Use a relational database, preferably PostgreSQL. Keep requests, positions, candidates, documents, tasks, workflow versions, transitions, activity events, comments, facilities, users, permissions and privacy records in appropriately related tables. Store documents in private object storage, not database blobs.

Implement:
- Migrations in source control.
- Server-side validation and authorization.
- Row-level security where supported and tested.
- Secure upload/download routes.
- Pagination and indexed filters.
- Audit event creation in the same transaction as the business action where possible.
- Idempotency for important submissions.
- Separate dev/staging/production environments.
- Backups and restore procedure.
- Cost alerts and file size limits.

Do not expose service-role keys or storage credentials in frontend code. Do not allow the browser to query privileged data directly without correctly configured security policies.

### R. Visual design

Create a premium but restrained business interface:
- White/off-white background.
- Charcoal typography.
- Restrained blue accent for actions.
- Subtle borders and spacing.
- Compact status badges with readable text.
- Minimal charts; useful tables and lists first.
- Clear typography and hierarchy.
- Mobile-responsive layouts and touch-friendly controls.
- Sidebar navigation on desktop; compact navigation on mobile.
- Forms grouped into short logical sections.
- Avoid gradients, excessive cards, decorative clutter and over-animated transitions.
- Use consistent accessible contrast, focus states and labels.

### S. Required demo scenarios

Use synthetic data to demonstrate:
1. A request for four positions with mixed statuses: one hired, one shortlisted, one searching, one on hold.
2. Candidate rejection with the position returning to sourcing.
3. Resume/photo validation blocking an incomplete submission.
4. CEO placing one position on hold and resuming it.
5. A dashboard number opening a filtered drill-down.
6. A CEO's My Actions showing pending decisions.
7. An ageing threshold making a position overdue.
8. An Admin publishing a new workflow version while existing requests remain on the old version.
9. A role attempting to access a forbidden candidate file and being denied.
10. Candidate data retention/deletion workflow.
11. Financial-year date filtering from 1 April to 31 March.
12. An authorized override requiring a reason and creating an audit event.

### T. Delivery expectations

Before considering the application complete, provide:
- Working responsive UI.
- Database schema and migrations.
- Authentication and server-enforced permissions.
- Workflow engine and configuration screens.
- Seeded facilities and synthetic demo data.
- Automated tests for core business rules, permissions, file security and workflow transitions.
- Deployment instructions and environment-variable list.
- Backup/restore instructions.
- Privacy/retention and incident-response checklist.
- A list of remaining manual legal/security sign-offs.

Do not claim production readiness until authorization tests, file privacy, backup restoration, privacy notice, retention and deployment configuration have been reviewed.

---

# 9. Test Plan and Acceptance Scenarios

## 9.1 Workflow tests
- Submit valid and invalid requests.
- Reject and return for clarification.
- Confirm approved quantity creates the correct number of positions.
- Change headcount after approval and verify explicit audited handling.
- Reject a candidate and return the position to sourcing.
- Mark Maybe without accidentally closing the position.
- Put one of several positions on hold.
- Hold and resume an entire request.
- Verify stage age pauses appropriately during hold while total calendar age continues.
- Verify hire date and closure outcome calculations.

## 9.2 Permission tests
- Employee cannot view another employee's restricted request.
- Finance cannot download resumes/photos by default.
- HR is limited to assigned facilities when configured.
- CEO/Owner can hold/resume across all facilities.
- Admin can configure workflow but cannot disable core security/audit controls.
- User cannot grant themselves permissions.
- Self-approval is blocked where configured.
- Disabled user cannot sign in or download a previously accessible file.

## 9.3 File security tests
- Missing resume blocks candidate submission.
- Missing photograph blocks candidate submission.
- Invalid file type/size is rejected.
- Guessing object key or URL does not grant access.
- Expired signed URL no longer works.
- File replacement creates an audit event.
- Deleted candidate documents are removed from active storage according to retention policy.
- Suspicious files are quarantined if scanning is configured.

## 9.4 Dashboard tests
- Card count matches drill-down list.
- Facility/status/date filters combine correctly.
- Counts do not mix request records with position records.
- My Actions only contains tasks assigned to the current user.
- Financial year starts 1 April and ends 31 March.
- “Hired during period” uses hire/joining timestamp.
- Historical state is calculated from events, not current status.
- Ageing thresholds and hold time calculations are correct.

## 9.5 Admin workflow tests
- Draft workflow can be previewed but does not affect live records.
- Invalid workflow cannot be published.
- Published version is immutable; changes create a new version.
- Existing records retain the original workflow by default.
- Explicit migration previews impacted records and is audited.
- Override requires permission and reason.
- Workflow cannot disable mandatory security/privacy requirements.

## 9.6 Privacy and incident tests
- Candidate notice version and collection event are recorded.
- Privacy request can be logged, assigned, tracked and resolved.
- Retention queue identifies expired records.
- Deletion workflow removes active documents and handles backups according to documented policy.
- Incident can be recorded and escalated.
- No candidate personal data is leaked through logs, analytics, public storage or email.

---

# 10. Implementation Roadmap

The implementation order deliberately excludes AI, conversational dashboards, resume parsing/summaries, candidate scoring, scheduled escalation bots and advanced workflow automation. Build and stabilize the core tracker first.

## Phase 0 — Decisions, legal review and setup
- Confirm the meaning of “Left”.
- Confirm approval routing, self-approval policy and Finance's role.
- Confirm whether “Hired” means offer accepted or actual joining (recommended: joined).
- Confirm whether candidate photography is necessary for every role.
- Have qualified Indian counsel review the Terms of Use, Internal User Privacy Notice, Candidate Privacy Notice, Disclaimer, retention/deletion summary and grievance contact.
- Confirm lawful basis for each processing purpose; do not assume a blanket checkbox is sufficient.
- Confirm retention periods, privacy contact, deletion-request process and breach escalation.
- Select hosting/storage region and review service/data-processing agreements.
- Configure dev/staging/production environments and synthetic test data.

## Phase 1 — Secure core tracker
- Authentication and six initial roles.
- User invitations, activation/deactivation and access management.
- Facilities and facility-level permissions.
- Vacancy request form, generated IDs and approval workflow.
- Individual position records per requested headcount unit.
- Candidate records and private resume/photo upload.
- Candidate notice delivery/acknowledgement records as applicable.
- Status transitions, hold/resume and position-level history.
- Dashboard, metric drill-down, My Actions and ageing.
- Week/month/quarter/year/YTD and Indian financial-year reporting.
- Comments and standard in-app record history.
- Legal pages: Terms of Use, Disclaimer, Internal User Privacy Notice, Candidate Privacy Notice, Acceptable Use & Confidentiality Rules, Data Retention and Deletion Summary, Privacy Request/Grievance Contact.
- Versioned legal documents and user acknowledgement records.
- Admin System & Audit Log, including background errors and configuration changes.
- Private file storage, server-side authorization, retention fields and deletion controls.
- Basic operational backup configuration and restore test.

## Phase 2 — Hardening, validation and launch readiness
- Versioned workflow configuration and validation.
- Fine-grained access/permission tests.
- Audit-log integrity and sensitive-document access logging.
- Privacy request and retention/deletion workflows.
- Export controls and audit trail for exports.
- Security testing, upload validation and safe error handling.
- Backup restoration exercise and documented incident response.
- Verify legal notices, effective dates, contracts, privacy contacts and obligations in force at go-live.
- User acceptance testing with synthetic data, training and production sign-off.

**Not in this release:** AI features, conversational dashboard, candidate ranking/scoring, resume extraction/summaries, scheduled reminders/escalations, automated external sourcing, WhatsApp integration or other unapproved automation. Revisit these only through a separately approved change request after the core tracker is stable.

# 11. Decisions to Confirm with Yash Honda

Record final decisions before development:
1. Does “Left” mean an employee has already left, or should the form use “Replacement—employee left”?
2. Is vacancy approval one of Manager/CEO/Owner, or sequential?
3. Does Finance review every vacancy or only compensation/budget cases?
4. Is “Hired” based on offer acceptance or actual joining? Recommended: actual joining.
5. Can a request be closed with unfilled positions? Recommended: yes, with a reason and explicit outcomes for remaining positions.
6. Are multiple candidates per position needed? Recommended: yes.
7. Is candidate photography necessary for every role and at what point? Product rule from current brief: required before candidate submission; confirm business necessity and legal/privacy treatment.
8. What retention period applies to unsuccessful candidates and hired candidates' recruitment records?
9. Who is the official privacy contact for candidate notices and requests?
10. Which users can see candidate photos and resumes? Recommended: authorized HR and decision-makers only.
11. Which facility-level restrictions apply to HR and requesters?
12. Which provider region and service agreement are acceptable after due diligence?

---

# 12. Official and Provider References

These links are a starting point; verify current terms, pricing and legal requirements before deployment.

## India privacy framework
- Ministry of Electronics and Information Technology: https://www.meity.gov.in/
- PIB release: Government notifies DPDP Rules (14 November 2025): https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014
- Check the official Act, Rules, corrigenda and enforcement timeline on MeitY/Gazette of India before production launch.

## Supabase
- Pricing: https://supabase.com/pricing
- Billing/quota documentation: https://supabase.com/docs/guides/platform/billing-on-supabase
- Storage pricing: https://supabase.com/docs/guides/storage/pricing

## Cloudflare R2
- Pricing and monthly free usage allowance: https://developers.cloudflare.com/r2/pricing/
- Getting started: https://developers.cloudflare.com/r2/get-started/

## Neon PostgreSQL (alternative)
- Pricing: https://neon.com/pricing

---

# 13. Final Recommendation

Build the Yash Honda Vacancy & Hiring Tracker around six reliable foundations:

1. **Correct data model:** request → individual positions → candidates/documents.
2. **Configurable workflow:** editable by the Admin, versioned and protected by validation.
3. **Actionable dashboard:** current metrics, My Actions, ageing and drill-down.
4. **Secure candidate records:** private resume/photo storage, least-privilege access, retention/deletion and incident response.
5. **Operational accountability:** detailed Admin-only System & Audit Log, approval reasons and tested backups.
6. **Legal/privacy controls:** versioned terms, disclaimers, privacy notices, actual acknowledgement/consent evidence where appropriate, and a workable privacy request process.

Start with Supabase for a streamlined PostgreSQL/auth/storage solution, using synthetic data during development and a paid production setup before storing real candidate records. Cloudflare R2 has a recurring monthly free allowance (10 GB-month Standard storage, 1 million Class A operations and 10 million Class B operations, subject to current published terms); beyond the allowance, usage charges apply. Consider R2 as a separate private document store if its economics justify the added integration.

Treat DPDP readiness as a product requirement from the beginning, but do not claim legal compliance solely because safeguards have been implemented. Have qualified Indian counsel validate the legal entity's obligations, notice and lawful basis, retention policy, vendor contracts and the provisions in force at launch.

**Definition of success:** Yash Honda can see every approved position, its current hiring stage, candidate documents, ageing, pending decision and final outcome; the Admin can safely adapt the workflow and inspect a detailed system/audit log; and legal notices, acknowledgement records, privacy operations and security safeguards are built into the core application. No AI or conversational dashboard is included.
