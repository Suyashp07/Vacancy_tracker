/**
 * Admin panels. Each one loads its own data, because the tabs are separate
 * addresses: opening the workflow view must not run the nine queries that the
 * accounts, privacy and audit screens need. Nothing here mutates through the
 * UI directly - every control is a server action that lands on a Postgres
 * function which writes its own audit row.
 */
import Link from 'next/link';
import { ArrowRight, Download, Search, ShieldCheck } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { StatefulForm } from '@/components/stateful-form';
import { Avatar, Badge, Card, Empty, Notice, SectionHead } from '@/components/ui';
import {
  LOCKED_FOR_ALL,
  PERMISSIONS,
  ROLE_LABEL,
  ROLE_PERMISSIONS,
  ROLES,
  fieldLabel,
  actionLabel,
  type PermissionKey,
  type Role,
} from '@/lib/constants';
import { fmtDate, fmtDateTime, daysSince } from '@/lib/format';
import {
  getApproverLoad,
  getAuditEvents,
  getDocumentAccessSummary,
  getRetentionQueue,
  listAcknowledgementLedger,
  listDsrRequests,
  listFacilities,
  listIncidents,
  listLegalDocuments,
  listRetentionPolicies,
  listUsers,
  listWorkflowDefinitions,
  type AckLedgerRow,
} from '@/server/policy';
import { getWorkflow } from '@/server/session';
import {
  createUser,
  fulfilDsr,
  generateUserSetupLink,
  publishLegalDocument,
  recordDsr,
  runRetentionPurge,
  saveLegalDraft,
  setRetention,
  setUserActive,
  setUserRole,
} from '@/server/actions';
import type {
  Actor,
  AuditEvent,
  DsrRequest,
  LegalDocument,
  RetentionItemRow,
  RetentionPolicy,
  SecurityIncident,
  WorkflowDefinition,
} from '@/types/domain';

type ApproverLoadRow = {
  assigned_role: Role | null;
  actor_id: string | null;
  holder: string;
  pending: number;
  overdue: number;
  acted_30d: number;
};

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------
export async function UsersPanel({ actor }: { actor: Actor }) {
  const [users, facilities, load] = await Promise.all([
    listUsers(),
    listFacilities(false),
    getApproverLoad(actor) as Promise<ApproverLoadRow[]>,
  ]);

  const active = users.filter((u) => u.is_active).length;
  const admins = users.filter((u) => u.role === 'Admin' && u.is_active).length;
  const approvers = users.filter((u) => (u.role === 'Owner' || u.role === 'CEO') && u.is_active).length;
  const neverSignedIn = users.filter((u) => !u.last_login_at).length;

  return (
    <>
      <div className="statline">
        <div className="stat">
          <div className="v tnum">{active}</div>
          <div className="k">Accounts that can sign in</div>
        </div>
        <div className="stat">
          <div className="v tnum">{users.length - active}</div>
          <div className="k">Deactivated, history intact</div>
        </div>
        <div className="stat">
          <div className="v tnum">{admins}</div>
          <div className="k">Administrator accounts</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: approvers < 2 ? 'var(--risk)' : undefined }}>
            {approvers}
          </div>
          <div className="k">Owner / CEO approvers</div>
        </div>
      </div>

      <div className="split">
        <Card className="section">
          <SectionHead
            title="Accounts"
            note={`${users.length} on record${neverSignedIn ? ` · ${neverSignedIn} have never signed in` : ''}`}
          />
          {users.length === 0 ? (
            <Empty title="No accounts yet" note="Create one below. Seeding is done, so the roster starts here." />
          ) : (
            <div style={{ margin: '0 -16px -16px' }}>
              {users.map((u) => (
                <div key={u.id} className={`userrow ${u.is_active ? '' : 'off'}`.trim()}>
                  <span className="uav">
                    <Avatar name={u.full_name} />
                  </span>
                  <div className="uwho">
                    <div className="cell-main">
                      {u.full_name}
                      {u.id === actor.id ? <span className="tiny muted"> · this is you</span> : null}
                    </div>
                    <div className="cell-id">{u.email}</div>
                    <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
                      <Badge tone={u.role === 'Admin' ? 'info' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
                      <Badge>{u.facility?.name ?? 'every facility'}</Badge>
                      {u.department ? <span className="tiny muted">{u.department}</span> : null}
                      {u.designation ? <span className="tiny muted">· {u.designation}</span> : null}
                      {!u.is_active ? <Badge tone="risk">disabled</Badge> : null}
                    </div>
                  </div>
                  <div className="umeta">
                    last sign-in
                    <br />
                    <span className="mono">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'never'}</span>
                  </div>
                  <div className="uacts">
                    <ActionForm
                      run={setUserRole}
                      args={[u.id]}
                      label="Change role"
                      variant="default"
                      submitLabel="Grant role"
                      intro={
                        u.id === actor.id
                          ? 'You cannot change your own role - the database refuses a self-grant, and this attempt would be logged as denied.'
                          : 'The new role applies to future actions. Everything this person already approved stays attributed to them.'
                      }
                      fields={[
                        {
                          name: 'role',
                          label: 'Role to grant',
                          type: 'select',
                          required: true,
                          defaultValue: u.role,
                          options: roleOptions,
                        },
                      ]}
                    />
                    <ActionForm
                      run={generateUserSetupLink}
                      args={[u.email]}
                      label="Setup link"
                      variant="default"
                      submitLabel="Generate link"
                      intro={`Generates a one-time password setup link for ${u.email} to share directly.`}
                    />
                    <ActionForm
                      run={setUserActive}
                      args={[u.id, !u.is_active]}
                      label={u.is_active ? 'Disable account' : 'Re-enable account'}
                      variant={u.is_active ? 'danger' : 'default'}
                      submitLabel={u.is_active ? 'Disable' : 'Re-enable'}
                      intro={
                        u.is_active
                          ? 'Disabling stops the sign-in and every action from it. The person is not deleted, so the trail of what they approved keeps its author.'
                          : 'The account can sign in again with the same role and facility scope it had before.'
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card pad>
            <SectionHead title="Create an account" note="no outbound email in this version" />
            <StatefulForm
              action={createUser}
              label="Create account"
              resetOnSuccess
              intro={
                <>
                  The account is created with a password nobody knows. Hand the person a password-recovery link
                  generated in Supabase (or set one there) - this portal sends no email.
                </>
              }
            >
              <div className="field">
                <label htmlFor="ac-name">Full name</label>
                <input id="ac-name" name="full_name" className="input" placeholder="As it should appear on approvals" required />
              </div>
              <div className="field">
                <label htmlFor="ac-email">Work email</label>
                <input id="ac-email" name="email" type="email" className="input" placeholder="name@yashhonda.in" required />
                <span className="hint">The email is the login. Shared inboxes are prohibited.</span>
              </div>
              <div className="grid2">
                <div className="field">
                  <label htmlFor="ac-role">Role</label>
                  <select id="ac-role" name="role" className="select" defaultValue="Employee" required>
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ac-fac">Primary facility</label>
                  <select id="ac-fac" name="primary_facility_id" className="select" defaultValue="">
                    <option value="">No single facility</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label htmlFor="ac-dept">Department</label>
                  <input id="ac-dept" name="department" className="input" placeholder="Service · Sales · Accounts" />
                </div>
                <div className="field">
                  <label htmlFor="ac-desig">Designation</label>
                  <input id="ac-desig" name="designation" className="input" placeholder="As on the payroll" />
                </div>
              </div>
            </StatefulForm>
          </Card>

          <Notice>
            <strong>Accounts are never deleted.</strong> A deactivated person still appears wherever their decision
            was recorded, which is what makes an approval history traceable. The database also refuses to leave the
            portal without a way to approve: the last active Administrator and the last Owner or CEO cannot be
            demoted or disabled.
          </Notice>
        </div>
      </div>

      <Card className="section">
        <SectionHead
          title="Approver load"
          note="pending tasks by the person or role pool they are assigned to, over all time"
        />
        {load.length === 0 ? (
          <Empty title="Nothing is waiting on anyone" note="No approval task is open right now." />
        ) : (
          <div className="scroll-x">
            <table className="reg">
              <thead>
                <tr>
                  <th>Who holds the queue</th>
                  <th>Role</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Acted in 30 days</th>
                </tr>
              </thead>
              <tbody>
                {load.map((r, i) => (
                  <tr key={`${r.actor_id ?? 'pool'}-${i}`}>
                    <td>
                      <div className="cell-main">{r.holder}</div>
                      {!r.actor_id ? <div className="tiny muted">unclaimed pool · any eligible approver</div> : null}
                    </td>
                    <td className="sub">{r.assigned_role ? ROLE_LABEL[r.assigned_role] : '—'}</td>
                    <td className="tnum">{r.pending}</td>
                    <td className="tnum" style={{ color: r.overdue ? 'var(--risk)' : undefined }}>
                      {r.overdue}
                    </td>
                    <td className="tnum">{r.acted_30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 12 }}>
          A name here is not pressure to act on it. It is the record of who was asked and did not answer, which is
          what a stalled hire is usually decided by.
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// permission matrix
// ---------------------------------------------------------------------------
const PERMISSION_GROUPS: { title: string; keys: PermissionKey[] }[] = [
  {
    title: 'Request lifecycle',
    keys: [
      'raise_vacancy_request',
      'edit_own_draft',
      'approve_vacancy',
      'decide_candidate',
      'review_hold',
      'close_position',
      'adjust_position_terms',
    ],
  },
  {
    title: 'Candidate data',
    keys: ['add_candidate', 'submit_candidate', 'confirm_joining', 'view_candidate_documents', 'view_security_incidents'],
  },
  {
    title: 'Scope and reporting',
    keys: ['review_budget', 'view_all_facilities', 'view_own_requests', 'activity_timeline', 'reports_export'],
  },
  {
    title: 'Configuration and accountability',
    keys: [
      'manage_users_roles',
      'manage_workflow',
      'manage_legal_documents',
      'configure_retention',
      'record_dsr',
      'view_audit_log',
    ],
  },
  {
    title: 'Refused to every role - no configuration opens these',
    keys: [...LOCKED_FOR_ALL, 'grant_role_to_self'],
  },
];

export async function AccessPanel() {
  return (
    <>
      <div className="legend" style={{ marginBottom: 14 }}>
        <span>
          <i style={{ background: 'var(--ok)' }} />
          granted by this role
        </span>
        <span>
          <i style={{ background: 'var(--line)' }} />
          no grant exists - a blank is a refusal, not an unknown
        </span>
        <span className="tiny">
          The same table the server checks on every read and write. Nothing below is a description of a rule; it is the rule.
        </span>
      </div>

      <Card className="mxwrap">
        <table className="mx">
          <thead>
            <tr>
              <th>Permission</th>
              {ROLES.map((r) => (
                <th key={r}>{ROLE_LABEL[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <FragmentGroup key={g.title} group={g} />
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid2 section">
        <Card pad>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <ShieldCheck size={16} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
            <div className="tiny">
              <strong>Administration is not hiring.</strong> System Admin holds no vacancy approval, no candidate
              decision and no resume access. A request raised by an Admin routes to Owner or CEO like anyone
              else&apos;s, and self-approval is blocked for every role - the database compares the actor with the
              person who submitted the record.
            </div>
          </div>
        </Card>
        <Card pad>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <ShieldCheck size={16} style={{ color: 'var(--ink-3)', flex: 'none', marginTop: 2 }} />
            <div className="tiny">
              <strong>No per-user overrides exist in this version.</strong> A person&apos;s access is their role plus
              their facility scope, which is why the matrix above is the complete answer to &quot;who can see
              this&quot; - there is no second list of exceptions to look for.
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function FragmentGroup({ group }: { group: { title: string; keys: PermissionKey[] } }) {
  return (
    <>
      <tr className="grp">
        <td colSpan={ROLES.length + 1}>{group.title}</td>
      </tr>
      {group.keys.map((key) => (
        <tr key={key}>
          <td>
            <div className="pkey">{PERMISSIONS[key]}</div>
            <div className="cell-id">{key}</div>
          </td>
          {ROLES.map((role) => {
            const granted = ROLE_PERMISSIONS[role].includes(key) && !LOCKED_FOR_ALL.includes(key);
            return (
              <td key={role}>
                {granted ? (
                  <Badge tone="ok">yes</Badge>
                ) : (
                  <span className="tiny muted">{LOCKED_FOR_ALL.includes(key) ? 'locked' : '—'}</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// workflow configuration
// ---------------------------------------------------------------------------
const WORKFLOW_KEYS = ['vacancy_request_default', 'position_default', 'candidate_default'] as const;

export async function WorkflowPanel() {
  const [definitions, ...workflows] = await Promise.all([
    listWorkflowDefinitions(),
    ...WORKFLOW_KEYS.map((k) => getWorkflow(k)),
  ]);

  return (
    <>
      <Notice tone="info">
        This is the configuration the engine actually evaluates. Every transition button in the portal is drawn from
        these rows, and the same rows are re-checked inside Postgres when the action is submitted - so a button that
        appears here cannot be bypassed by a handcrafted request, and a step removed here stops working immediately.
      </Notice>

      {WORKFLOW_KEYS.map((workflowKey, wi) => {
        const wf = workflows[wi];
        const def = definitions.find((d: WorkflowDefinition) => d.key === workflowKey) ?? null;
        const approvalSteps = wf.steps.filter((s) => s.step_type === 'approval').length;
        const terminals = wf.steps.filter((s) => s.is_terminal).length;
        return (
          <Card key={workflowKey} className="section">
            <SectionHead
              title={def?.name ?? wf.key ?? 'Workflow'}
              note={`${wf.steps.length} steps · ${approvalSteps} approval · ${terminals} terminal`}
              right={<span className="cell-id">{wf.key}</span>}
            />

            <div className="wfg">
              {wf.steps.map((s, i) => (
                <span key={s.status_key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span
                    className={`wnode ${s.is_terminal ? 'term' : s.step_type === 'approval' ? 'appr' : ''}`.trim()}
                  >
                    {s.label}
                  </span>
                  {i < wf.steps.length - 1 ? (
                    <span className="wedge">
                      <ArrowRight size={13} />
                    </span>
                  ) : null}
                </span>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--line)' }}>
              {wf.steps.map((s, i) => {
                const sla =
                  s.max_sla_days || s.overdue_sla_days
                    ? `${s.max_sla_days ?? '—'}d warn / ${s.overdue_sla_days ?? '—'}d overdue`
                    : 'no clock';
                return (
                  <div className="wstep" key={s.status_key}>
                    <span className="widx">{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-main">
                        {s.label}
                        {s.is_terminal ? <Badge>terminal</Badge> : null}
                        {s.step_type === 'approval' ? <Badge tone="info">approval</Badge> : null}
                      </div>
                      <div className="cell-id">{s.status_key}</div>
                      <div className="tiny muted" style={{ marginTop: 4 }}>
                        {s.allowed_roles.length ? s.allowed_roles.join(' · ') : 'system action'}
                        {s.required_fields.length
                          ? ` · needs ${s.required_fields.map(fieldLabel).join(', ')}`
                          : ''}
                        {s.required_documents.length
                          ? ` · documents: ${s.required_documents.join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <span className="mono tiny muted">{sla}</span>
                  </div>
                );
              })}
            </div>

            <div className="scroll-x" style={{ marginTop: 2 }}>
              <table className="reg">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Action</th>
                    <th>To</th>
                    <th>Roles</th>
                    <th>Evidence required</th>
                  </tr>
                </thead>
                <tbody>
                  {wf.transitions.map((t) => (
                    <tr key={`${t.from_status}-${t.action}`}>
                      <td className="sub">{t.from_status.replace(/_/g, ' ')}</td>
                      <td>
                        <div className="cell-main">{actionLabel(t.action)}</div>
                        <div className="cell-id">{t.action}</div>
                      </td>
                      <td className="sub">{t.to_status.replace(/_/g, ' ')}</td>
                      <td className="tiny">{t.allowed_roles.length ? t.allowed_roles.join(' · ') : 'system'}</td>
                      <td className="tiny">
                        {t.requires_reason ? 'reason ' : ''}
                        {t.requires_comment ? '· comment' : ''}
                        {!t.requires_reason && !t.requires_comment ? <span className="muted">nothing</span> : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <Notice>
        <strong>Editing the workflow is a data change, not a setting.</strong> A visual editor is deliberately out of
        this version: steps and transitions are seeded rows, and a change to them has to be validated (no orphaned
        status, every path reaching a terminal state, no approval step without an eligible actor) before it can be
        published. Until that validator exists as a screen, the way to change a workflow is a migration reviewed by a
        person - which is also how it stays reversible.
      </Notice>
    </>
  );
}

// ---------------------------------------------------------------------------
// facilities
// ---------------------------------------------------------------------------
export async function FacilitiesPanel() {
  const facilities = await listFacilities(false);
  return (
    <>
      <Card>
        <SectionHead title="Facilities" note={`${facilities.length} configured · ${facilities.filter((f) => f.is_active).length} open to new requests`} />
        <table className="reg">
          <thead>
            <tr>
              <th>Facility</th>
              <th>Code</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="cell-main">{f.name}</div>
                  {f.city ? <div className="tiny muted">{f.city}</div> : null}
                </td>
                <td className="cell-id">{f.code}</td>
                <td className="sub">{f.facility_type}</td>
                <td>
                  {f.is_active ? (
                    <Badge tone="ok" dot>
                      active
                    </Badge>
                  ) : (
                    <Badge tone="hold">inactive</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="stacknote" style={{ marginTop: 16 }}>
        <strong className="mono" style={{ fontSize: 12 }}>
          facilities are configuration, not constants
        </strong>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Screens never contain a facility name: every picker, filter and report reads these rows. Deactivating a
          facility removes it from new requests while keeping every position, approval and candidate linked to it
          readable - which is why there is no delete control here. Renaming is applied to the row and shows in history
          immediately.
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// legal documents
// ---------------------------------------------------------------------------
const LEGAL_KEYS: { key: string; label: string; surface: string }[] = [
  { key: 'privacy_policy', label: 'Privacy notice and consent', surface: 'acknowledged at first sign-in' },
  { key: 'terms_of_use', label: 'Portal terms of use', surface: 'acknowledged at first sign-in' },
  { key: 'consent_notice', label: 'Candidate consent notice', surface: 'for candidates, not portal logins' },
  { key: 'grievance', label: 'Grievance officer and redressal', surface: 'readable on /legal once published' },
  { key: 'retention_policy', label: 'Data retention policy', surface: 'the periods live in the retention table' },
  { key: 'access_policy', label: 'Internal access and role policy', surface: 'describes the Access tab' },
  { key: 'prohibited_data', label: 'Prohibited data notice', surface: 'quoted on the candidate screens' },
];

function ackCount(ledger: AckLedgerRow[], documentId: string): number {
  return ledger.filter((l) => l.document_id === documentId).length;
}

function DocStatus({ status }: { status: LegalDocument['status'] }) {
  if (status === 'published') return <Badge tone="ok" dot>published</Badge>;
  if (status === 'superseded') return <Badge tone="hold">superseded</Badge>;
  return <Badge tone="wait">draft</Badge>;
}

export async function LegalPanel() {
  const [docs, ledger] = await Promise.all([listLegalDocuments(), listAcknowledgementLedger()]);
  const drafts = docs.filter((d) => d.status === 'draft');
  const published = docs.filter((d) => d.status === 'published');

  return (
    <>
      <div className="statline">
        <div className="stat">
          <div className="v tnum">{published.length}</div>
          <div className="k">Versions people can read</div>
        </div>
        <div className="stat">
          <div className="v tnum">{drafts.length}</div>
          <div className="k">Drafts, invisible until published</div>
        </div>
        <div className="stat">
          <div className="v tnum">{ledger.length}</div>
          <div className="k">Acceptances recorded</div>
        </div>
      </div>

      <Card className="section">
        <SectionHead title="Every version on record" note="publishing a version supersedes the one before it, it never replaces it" />
        {docs.length === 0 ? (
          <Empty title="No documents" note="Nothing has been authored yet." />
        ) : (
          <div className="scroll-x">
            <table className="reg">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Effective / published</th>
                  <th>Accepted by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="cell-main">{d.title}</div>
                      <div className="cell-id">{d.key}</div>
                    </td>
                    <td className="cell-id">{d.version}</td>
                    <td>
                      <DocStatus status={d.status} />
                    </td>
                    <td className="sub">
                      {d.status === 'published' ? fmtDate(d.effective_from ?? d.published_at) : 'not published'}
                      <div className="tiny muted">updated {fmtDateTime(d.updated_at)}</div>
                    </td>
                    <td className="tnum">{d.status === 'published' ? ackCount(ledger, d.id) : '—'}</td>
                    <td className="nowrap">
                      {d.status === 'draft' ? (
                        <ActionForm
                          run={publishLegalDocument}
                          args={[d.id]}
                          label="Publish this version"
                          variant="primary"
                          submitLabel="Publish"
                          intro={`Effective from today. The previous published version of "${d.key}" becomes superseded, and everyone is asked to accept this one before their next approval, decision or hold.`}
                        />
                      ) : (
                        <Link href={`/legal?doc=${d.id}`} className="btn sm ghost">
                          Read as a user sees it
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="split">
        <Card pad>
          <SectionHead title="Acknowledgement ledger" note="who accepted which version, and when" />
          {ledger.length === 0 ? (
            <Empty
              title="Nobody has accepted anything yet"
              note="Acceptance rows appear when a person submits the acknowledgment screen."
            />
          ) : (
            <div className="scroll-x">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Document</th>
                    <th>Version</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 40).map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-main">{l.user_name}</div>
                        <div className="cell-id">{l.user_email}</div>
                      </td>
                      <td className="sub">
                        {l.document_title}
                        <div className="tiny muted">{l.document_key}</div>
                      </td>
                      <td className="cell-id">{l.document_version}</td>
                      <td className="mono tiny">{fmtDateTime(l.accepted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ledger.length > 40 ? (
            <div className="tiny muted" style={{ marginTop: 10 }}>
              Showing the most recent 40 of {ledger.length} acceptances.
            </div>
          ) : null}
        </Card>

        <Card pad>
          <SectionHead title="Author a version" note="saves as a draft" />
          <StatefulForm
            action={saveLegalDraft}
            label="Save draft"
            resetOnSuccess
            intro={
              <>
                A draft is invisible to everyone but an Admin. Publishing is a separate act, and the database refuses a
                body shorter than forty characters, so a stub cannot become a notice by accident.
              </>
            }
          >
            <div className="field">
              <label htmlFor="ld-key">Document</label>
              <select id="ld-key" name="key" className="select" defaultValue="privacy_policy" required>
                {LEGAL_KEYS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label} - {k.surface}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="ld-title">Title</label>
                <input id="ld-title" name="title" className="input" placeholder="How people will see it named" required />
              </div>
              <div className="field">
                <label htmlFor="ld-version">Version</label>
                <input id="ld-version" name="version" className="input" placeholder="1.1" required />
                <span className="hint">Same key and version again updates that draft instead of duplicating it.</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ld-body">Body (markdown)</label>
              <textarea
                id="ld-body"
                name="body_md"
                className="textarea"
                rows={12}
                placeholder={'# What we collect\n\n- name, city, phone, email\n- resume and photograph\n\n## What we never collect\n\nAadhaar, PAN, bank details.'}
                required
              />
              <span className="hint">
                Headings, paragraphs, bullets and numbered lists render as written. Bold and inline code too.
              </span>
            </div>
          </StatefulForm>
        </Card>
      </div>

      <Notice tone="info">
        <strong>Two of these are enforced; the rest are text.</strong> The privacy notice and the terms of use gate
        every write in Postgres - until a person accepts the published version, the database refuses an approval, a
        decision, a hold or a candidate record from that account. The candidate consent notice has no delivery record
        yet: nothing in this build proves a candidate was shown it, and that gap should be closed before real
        candidate data is entered rather than papered over by publishing a document.
      </Notice>
    </>
  );
}

// ---------------------------------------------------------------------------
// privacy and retention
// ---------------------------------------------------------------------------
const DSR_TYPE_LABEL: Record<string, string> = {
  access: 'Access - what do you hold about me',
  correction: 'Correction - fix a record',
  erasure: 'Erasure - delete my data',
  withdraw_consent: 'Withdraw consent',
  grievance: 'Grievance',
  nominee: 'Nominee or authorised representative',
};

function DsrStatus({ status }: { status: DsrRequest['status'] }) {
  if (status === 'fulfilled') return <Badge tone="ok" dot>answered</Badge>;
  if (status === 'partially_fulfilled') return <Badge tone="wait">partly answered</Badge>;
  if (status === 'rejected') return <Badge tone="risk">refused</Badge>;
  if (status === 'closed') return <Badge tone="hold">closed</Badge>;
  if (status === 'in_progress') return <Badge tone="progress">being worked on</Badge>;
  return <Badge tone="wait">open</Badge>;
}

function Severity({ level }: { level: SecurityIncident['severity'] }) {
  const tone = level === 'critical' || level === 'high' ? 'risk' : level === 'medium' ? 'wait' : 'neutral';
  return <Badge tone={tone}>{level}</Badge>;
}

/** Positive when the date has passed, negative while there is still time. */
function daysPast(iso: string | null): number | null {
  const since = daysSince(iso);
  return since === null ? null : Math.round(since);
}

export async function PrivacyPanel({ actor }: { actor: Actor }) {
  const [policies, queue, dsrs, incidents, access] = await Promise.all([
    listRetentionPolicies(),
    getRetentionQueue(),
    listDsrRequests(),
    listIncidents(),
    getDocumentAccessSummary(actor),
  ]);

  const live = queue.filter((q: RetentionItemRow) => !q.deleted_at);
  const pastDue = live.filter((q) => (daysPast(q.due_at) ?? 0) > 0);
  const dueSoon = live.filter((q) => {
    const p = daysPast(q.due_at) ?? 0;
    return p <= 0 && p > -30;
  });
  const openDsr = dsrs.filter((d) => d.status === 'open' || d.status === 'in_progress');
  const overdueDsr = openDsr.filter((d) => (daysPast(d.statutory_due_at) ?? 0) > 0);
  const openIncidents = incidents.filter((i) => !i.closed_at);

  return (
    <>
      <div className="statline">
        <div className="stat">
          <div className="v tnum">{live.length}</div>
          <div className="k">Records on a deletion clock</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: dueSoon.length ? 'var(--warn)' : undefined }}>
            {dueSoon.length}
          </div>
          <div className="k">Due within 30 days</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: pastDue.length ? 'var(--risk)' : undefined }}>
            {pastDue.length}
          </div>
          <div className="k">Past their due date</div>
        </div>
        <div className="stat">
          <div className="v tnum" style={{ color: overdueDsr.length ? 'var(--risk)' : undefined }}>
            {openDsr.length}
          </div>
          <div className="k">Privacy requests awaiting an answer</div>
        </div>
      </div>

      <Card className="section">
        <SectionHead
          title="Retention periods"
          note="how long each kind of personal data is kept after the event that starts its clock"
        />
        <div className="scroll-x">
          <table className="reg">
            <thead>
              <tr>
                <th>Data</th>
                <th>Kept for</th>
                <th>Purpose on record</th>
                <th>Basis</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p: RetentionPolicy) => (
                <tr key={p.id}>
                  <td>
                    <div className="cell-main">{p.data_category.replace(/_/g, ' ')}</div>
                    <div className="tiny muted">{p.is_active ? 'in force' : 'not active'}</div>
                  </td>
                  <td>
                    <span className="mono">{p.retention_days}</span>
                    <span className="tiny muted"> days</span>
                  </td>
                  <td className="tiny" style={{ maxWidth: 360 }}>
                    {p.purpose}
                  </td>
                  <td className="sub">{p.legal_basis.replace(/_/g, ' ')}</td>
                  <td className="cell-id">v{p.version}</td>
                  <td className="nowrap">
                    <ActionForm
                      run={setRetention}
                      args={[p.id]}
                      label="Change"
                      variant="default"
                      submitLabel="Save new period"
                      intro="The change is attributed to you and the previous period is kept in the audit entry. Records already scheduled keep the date they were given under the old period."
                      fields={[
                        {
                          name: 'days',
                          label: 'Days to keep it',
                          type: 'number',
                          required: true,
                          defaultValue: p.retention_days,
                          hint: 'Between 1 day and 7 years. Nothing may be kept forever without a stated purpose.',
                        },
                      ]}
                    >
                      <div className="field">
                        <label htmlFor={`purpose-${p.id}`}>Why it is kept</label>
                        <textarea id={`purpose-${p.id}`} name="purpose" className="textarea" defaultValue={p.purpose} required />
                        <span className="hint">Rewrite this if the reason changes. A period without a purpose is not a lawful retention.</span>
                      </div>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Notice tone={pastDue.length > 0 ? 'risk' : 'info'}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong>DPDP Retention Enforcement:</strong>{' '}
            {pastDue.length > 0
              ? `${pastDue.length} expired ${pastDue.length === 1 ? 'record is' : 'records are'} due for statutory destruction under Indian DPDP retention rules.`
              : 'All candidate personal records are currently within statutory retention periods.'}
          </div>
          <ActionForm
            run={runRetentionPurge}
            args={[]}
            label="Run retention purge now"
            variant={pastDue.length > 0 ? 'danger' : 'default'}
            submitLabel="Execute Purge"
            intro="Statutory purge under DPDP Act 2023. Permanently deletes candidate personal data, notes, and attachments past their retention due date while preserving immutable audit logs of the deletion."
          />
        </div>
      </Notice>

      <div className="split section">
        <Card>
          <SectionHead title="Privacy requests" note="access · correction · erasure · grievance" />
          {dsrs.length === 0 ? (
            <Empty title="No request has been logged" note="Log one as soon as it arrives, even if it arrived by telephone." />
          ) : (
            <div className="scroll-x">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>About</th>
                    <th>Asked for</th>
                    <th>Status</th>
                    <th>Answer by</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dsrs.map((d: DsrRequest) => {
                    const past = daysPast(d.status === 'open' || d.status === 'in_progress' ? d.statutory_due_at : d.fulfilled_at ?? d.statutory_due_at);
                    const pending = d.status === 'open' || d.status === 'in_progress';
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="cell-id">{d.reference}</div>
                          <div className="tiny muted">logged {fmtDate(d.created_at)}</div>
                        </td>
                        <td>
                          <div className="cell-main">{d.subject_name ?? 'name not given'}</div>
                          <div className="cell-id">{d.subject_email}</div>
                          <div className="tiny muted">{d.subject_category}</div>
                        </td>
                        <td className="tiny" style={{ maxWidth: 240 }}>
                          {DSR_TYPE_LABEL[d.request_type] ?? d.request_type}
                          {d.detail ? <div className="muted">{d.detail}</div> : null}
                        </td>
                        <td>
                          <DsrStatus status={d.status} />
                          {d.response_summary ? (
                            <div className="tiny muted" style={{ maxWidth: 220 }}>
                              {d.response_summary}
                            </div>
                          ) : null}
                        </td>
                        <td className="sub">
                          {fmtDate(d.statutory_due_at)}
                          {pending ? (
                            <div className="tiny" style={{ color: (past ?? 0) > 0 ? 'var(--risk)' : 'var(--ink-3)' }}>
                              {(past ?? 0) > 0 ? `${past} days past due` : `${-(past ?? 0)} days left`}
                            </div>
                          ) : (
                            <div className="tiny muted">answered {fmtDate(d.fulfilled_at)}</div>
                          )}
                        </td>
                        <td className="nowrap">
                          {pending ? (
                            <>
                              <ActionForm
                                run={fulfilDsr}
                                args={[d.id, 'fulfilled']}
                                label="Record answer"
                                variant="primary"
                                submitLabel="Record it"
                                requireComment
                                commentLabel="What was sent back to the person"
                                intro="Write what the person actually received. An erasure request that is answered this way also puts that subject's own records on the deletion clock."
                              />
                              <ActionForm
                                run={fulfilDsr}
                                args={[d.id, 'rejected']}
                                label="Refuse"
                                variant="danger"
                                submitLabel="Refuse with reason"
                                requireComment
                                commentLabel="The legal ground for refusing"
                                intro="A refusal is a decision with a reason attached, kept as long as the request itself."
                              />
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card pad>
            <SectionHead title="Log a request" note="starts a 30-day clock" />
            <StatefulForm
              action={recordDsr}
              label="Log it"
              resetOnSuccess
              intro="Log the request the moment it reaches anyone in the company, however it arrived."
            >
              <div className="field">
                <label htmlFor="dsr-type">What is being asked for</label>
                <select id="dsr-type" name="request_type" className="select" defaultValue="access" required>
                  {Object.entries(DSR_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid2">
                <div className="field">
                  <label htmlFor="dsr-email">Email of the person</label>
                  <input id="dsr-email" name="subject_email" type="email" className="input" required />
                  <span className="hint">This is how their records are found.</span>
                </div>
                <div className="field">
                  <label htmlFor="dsr-name">Name, if given</label>
                  <input id="dsr-name" name="subject_name" className="input" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="dsr-cat">They are</label>
                <select id="dsr-cat" name="subject_category" className="select" defaultValue="Candidate">
                  <option value="Candidate">A candidate</option>
                  <option value="Employee">An employee or portal user</option>
                  <option value="Portal User">A portal user</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="dsr-detail">How it arrived and what they said</label>
                <textarea
                  id="dsr-detail"
                  name="detail"
                  className="textarea"
                  placeholder="Called the Fursungi showroom on 12 Oct, asked for the resume they sent to be destroyed."
                />
              </div>
            </StatefulForm>
          </Card>

          <Card pad>
            <SectionHead title="Open incidents" note="suspected misuse of access, logged by the system" />
            {incidents.length === 0 ? (
              <div className="tiny muted">
                Nothing is open. A refused document access or a failed sign-in spiking against one account is written
                here by the same call that shows the person a polite refusal.
              </div>
            ) : (
              <div className="scroll-x">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Detected</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>What happened</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((i: SecurityIncident) => (
                      <tr key={i.id}>
                        <td className="mono tiny">{fmtDateTime(i.detected_at)}</td>
                        <td className="sub">{i.incident_type.replace(/_/g, ' ')}</td>
                        <td>
                          <Severity level={i.severity} />
                        </td>
                        <td className="tiny" style={{ maxWidth: 320 }}>
                          {i.detail}
                          <div className="muted">
                            {i.actor_user_id ? `account ${i.actor_user_id.slice(0, 8)}` : 'no account'}
                            {i.actor_ip ? ` · ${i.actor_ip}` : ''}
                          </div>
                        </td>
                        <td>
                          {i.closed_at ? (
                            <Badge tone="hold">closed</Badge>
                          ) : i.acknowledged_at ? (
                            <Badge tone="wait">acknowledged</Badge>
                          ) : (
                            <Badge tone="risk">unreviewed</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="section">
        <SectionHead
          title="Who opened candidate documents"
          note="every signed view and download is logged against the person who asked for it"
        />
        {access.length === 0 ? (
          <Empty title="No document has been opened" note="Not one resume or photograph has been viewed yet." />
        ) : (
          <div className="scroll-x">
            <table className="reg">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Opens</th>
                  <th>Downloads</th>
                  <th>Distinct documents</th>
                  <th>Last access</th>
                </tr>
              </thead>
              <tbody>
                {access.map((r: Record<string, unknown>, i: number) => (
                  <tr key={`${String(r.actor_id ?? 'x')}-${i}`}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Avatar name={String(r.actor_name ?? '?')} />
                        <span className="cell-main">{String(r.actor_name ?? 'A former account')}</span>
                      </div>
                    </td>
                    <td className="sub">
                      {r.actor_role ? ROLE_LABEL[r.actor_role as Role] ?? String(r.actor_role) : '—'}
                    </td>
                    <td className="tnum">{Number(r.accesses ?? 0)}</td>
                    <td className="tnum" style={{ color: Number(r.downloads) > 0 ? 'var(--warn)' : undefined }}>
                      {Number(r.downloads ?? 0)}
                    </td>
                    <td className="tnum">{Number(r.distinct_documents ?? 0)}</td>
                    <td className="mono tiny">{fmtDateTime(String(r.last_access_at ?? ''))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tiny muted" style={{ marginTop: 12 }}>
          A download is not misconduct and this table does not accuse anyone. It is the answer to &quot;who could have
          taken this,&quot; which is the only reason a private link is acceptable in the first place.
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// audit register
// ---------------------------------------------------------------------------
function KindBadge({ kind }: { kind: string }) {
  const tone =
    kind === 'auth' || kind === 'user'
      ? 'risk'
      : kind === 'legal' || kind === 'retention' || kind === 'dsr'
        ? 'info'
        : kind === 'document' || kind === 'position' || kind === 'candidate' || kind === 'vacancy_request'
          ? 'progress'
          : 'neutral';
  return <Badge tone={tone}>{kind}</Badge>;
}

function ResultBadge({ result }: { result: AuditEvent['result'] }) {
  if (result === 'success') return <Badge tone="ok" dot>done</Badge>;
  if (result === 'denied') return <Badge tone="risk">refused</Badge>;
  if (result === 'conflict') return <Badge tone="wait">conflict</Badge>;
  if (result === 'validation_error') return <Badge tone="wait">rejected</Badge>;
  return <Badge tone="risk">error</Badge>;
}

export async function AuditPanel({ params }: { params: { cat?: string; q?: string; result?: string } }) {
  const [events, users] = await Promise.all([getAuditEvents({ limit: 300 }), listUsers()]);

  const kindOf = (action: string) => action.split('.')[0] ?? action;
  const kinds = Array.from(new Set(events.map((e) => kindOf(e.action)))).sort();
  const activeKind = params.cat && kinds.includes(params.cat) ? params.cat : 'all';
  const activeResult = ['success', 'denied', 'failure', 'validation_error', 'conflict'].includes(params.result ?? '')
    ? (params.result as AuditEvent['result'])
    : null;
  const q = (params.q ?? '').trim().toLowerCase();

  const nameOf = (id: string | null) => {
    if (!id) return 'no account';
    const u = users.find((x) => x.id === id);
    return u ? u.full_name : 'A former account';
  };

  const shown = events.filter((e) => {
    if (activeKind !== 'all' && kindOf(e.action) !== activeKind) return false;
    if (activeResult && e.result !== activeResult) return false;
    if (!q) return true;
    return `${e.action} ${e.entity_type} ${e.entity_id ?? ''} ${e.reason ?? ''} ${nameOf(e.actor_id)} ${e.actor_role ?? ''}`
      .toLowerCase()
      .includes(q);
  });

  const refused = events.filter((e) => e.result === 'denied').length;

  return (
    <>
      <div className="tools">
        <div className="fchips">
          <Link href={`/admin?tab=audit${activeResult ? `&result=${activeResult}` : ''}`} className={`chip ${activeKind === 'all' ? 'on' : ''}`.trim()}>
            everything
          </Link>
          {kinds.map((k) => (
            <Link
              key={k}
              href={`/admin?tab=audit&cat=${k}${activeResult ? `&result=${activeResult}` : ''}`}
              className={`chip ${activeKind === k ? 'on' : ''}`.trim()}
            >
              {k.replace(/_/g, ' ')}
            </Link>
          ))}
        </div>
        <div className="tail">
          <form method="get" action="/admin" className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input type="hidden" name="tab" value="audit" />
            {activeKind !== 'all' ? <input type="hidden" name="cat" value={activeKind} /> : null}
            {activeResult ? <input type="hidden" name="result" value={activeResult} /> : null}
            <div className="search">
              <Search size={15} />
              <input
                className="input"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Action, account, record id, reason"
                aria-label="Search the audit register"
              />
            </div>
            <select
              className="select"
              name="result"
              aria-label="Outcome"
              defaultValue={activeResult ?? ''}
              style={{ minWidth: 132 }}
            >
              <option value="">Any outcome</option>
              <option value="success">Completed</option>
              <option value="denied">Refused</option>
              <option value="validation_error">Rejected by validation</option>
              <option value="conflict">Conflict</option>
              <option value="failure">Error</option>
            </select>
            <button type="submit" className="btn sm">
              Apply
            </button>
            <a href="/api/export?type=audit" download className="btn sm ghost" title="Export full audit register as CSV">
              <Download size={14} />
              Export CSV
            </a>
          </form>
        </div>
      </div>

      <Card>
        <div className="loghead">
          <div>When</div>
          <div>Kind</div>
          <div>Who</div>
          <div>Action on which record</div>
          <div>Outcome</div>
        </div>
        {shown.length === 0 ? (
          <Empty
            title="No event matches"
            note="Widen the kind or clear the search. A quiet register is not an empty system - it means nothing was attempted outside the rules."
          />
        ) : (
          shown.map((e) => (
            <div className="logrow" key={e.id}>
              <span className="mono tiny">{fmtDateTime(e.occurred_at)}</span>
              <KindBadge kind={kindOf(e.action)} />
              <span>
                <div className="cell-main">{nameOf(e.actor_id)}</div>
                {e.actor_role ? <div className="tiny muted">{ROLE_LABEL[e.actor_role]}</div> : null}
              </span>
              <span style={{ minWidth: 0 }}>
                <div>{actionLabel(e.action)}</div>
                <div className="cell-id">
                  {e.entity_type}
                  {e.entity_id ? ` · ${String(e.entity_id).slice(0, 8)}` : ''}
                </div>
                {e.reason ? <div className="tiny muted">{e.reason}</div> : null}
              </span>
              <ResultBadge result={e.result} />
            </div>
          ))
        )}
      </Card>

      <div className="tiny muted" style={{ marginTop: 12 }}>
        Reading the last {events.length} entries · {refused} of them {refused === 1 ? 'was' : 'were'} refused by the
        database. A page shows a window, not the whole register.
      </div>

      <Notice tone="info">
        <strong>This register cannot be edited by anyone, including you.</strong> There is no update or delete policy
        on it and a trigger refuses even the table owner, so a correction is a new entry that names the original.
        Passwords, tokens, resume contents, photographs and full candidate contact details are never written here -
        the reason column holds the sentence a person typed, because that is the part an accountable decision is made
        of.
      </Notice>
    </>
  );
}
