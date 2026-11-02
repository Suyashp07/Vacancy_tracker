/** Row shapes returned by Supabase. Nullable exactly where the schema is nullable. */
import type {
  CandidateStatus,
  DocumentType,
  PositionStatus,
  RequestStatus,
  Role,
  TaskType,
} from '@/lib/constants';

export type UUID = string;
export type IsoDateTime = string;

export interface Facility {
  id: UUID;
  code: string;
  name: string;
  facility_type: string;
  city: string | null;
  is_active: boolean;
}

export interface AppUser {
  id: UUID;
  email: string;
  full_name: string;
  role: Role;
  primary_facility_id: UUID | null;
  department: string | null;
  designation: string | null;
  is_active: boolean;
  last_login_at: IsoDateTime | null;
}

/** The authenticated principal, resolved once per request by session.ts. */
export interface Actor {
  id: UUID;
  email: string;
  name: string;
  role: Role;
  facilityIds: UUID[];
  isGlobal: boolean;
  legalAckVersion: string | null;
}

export interface VacancyRequest {
  id: UUID;
  number: string;
  title: string;
  reason: string;
  facility_id: UUID;
  position_type: string;
  min_qualification: string | null;
  experience_text: string | null;
  has_backfill_ref: boolean;
  backfill_ref_note: string | null;
  budget_available: boolean | null;
  ctc_min: number | string | null;
  ctc_max: number | string | null;
  joining_date: string | null;
  is_urgent: boolean;
  status: RequestStatus;
  quantity: number;
  target_fill_date: string | null;
  justification: string;
  previous_employee_name: string | null;
  acknowledgement_accepted: boolean;
  acknowledgement_version: string | null;
  submitted_at: IsoDateTime | null;
  submitted_by: UUID | null;
  closed_at: IsoDateTime | null;
  closure_reason: string | null;
  created_at: IsoDateTime;
  created_by: UUID | null;
  updated_at: IsoDateTime;
}

export interface Position {
  id: UUID;
  request_id: UUID;
  position_number: string;
  label: string;
  facility_id: UUID;
  status: PositionStatus;
  previous_status_before_hold: PositionStatus | null;
  hold_reason: string | null;
  hold_start_date: string | null;
  hold_end_date_expected: string | null;
  resume_required: boolean;
  photo_required: boolean;
  ctc_min: number | string | null;
  ctc_max: number | string | null;
  target_fill_date: string | null;
  hired_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Candidate {
  id: UUID;
  position_id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  current_location: string | null;
  expected_ctc: number | string | null;
  experience_text: string | null;
  qualifications: string | null;
  notice_period_days: number | null;
  source: string | null;
  status: CandidateStatus;
  rejection_reason: string | null;
  submitted_for_approval_at: IsoDateTime | null;
  decision_at: IsoDateTime | null;
  approved_for_joining_at: IsoDateTime | null;
  actual_joining_date: string | null;
  created_at: IsoDateTime;
  created_by: UUID | null;
  updated_at: IsoDateTime;
}

export interface CandidateDocument {
  id: UUID;
  candidate_id: UUID;
  document_type: DocumentType;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: UUID | null;
  uploaded_at: IsoDateTime;
  verification_status: string;
  is_mandatory: boolean;
  is_exception: boolean;
  exception_reason: string | null;
}

export interface ApprovalTask {
  id: UUID;
  entity_type: 'vacancy_request' | 'position' | 'candidate';
  entity_id: UUID;
  position_id: UUID | null;
  task_type: TaskType;
  assigned_role: Role | null;
  assigned_user_id: UUID | null;
  requested_by: UUID | null;
  status: 'pending' | 'acted' | 'cancelled' | 'expired';
  priority: string | null;
  sla_hours: number | null;
  due_at: IsoDateTime | null;
  acted_at: IsoDateTime | null;
  acted_by: UUID | null;
  action: string | null;
  comment: string | null;
  created_at: IsoDateTime;
}

export interface WorkflowStep {
  id: UUID;
  workflow_id: UUID;
  status_key: string;
  label: string;
  step_type: 'approval' | 'system';
  required_fields: string[];
  required_documents: string[];
  allowed_actions: string[];
  allowed_roles: string[];
  max_sla_days: number | null;
  overdue_sla_days: number | null;
  sort_order: number;
  is_terminal: boolean;
}

/** One configured workflow, as the definition row states it. */
export interface WorkflowDefinition {
  id: UUID;
  key: string;
  name: string;
  entity_type: 'vacancy_request' | 'position' | 'candidate';
  is_active: boolean;
  updated_at: IsoDateTime;
}

export interface WorkflowTransition {
  id: UUID;
  workflow_id: UUID;
  from_status: string;
  action: string;
  to_status: string;
  allowed_roles: string[];
  requires_reason: boolean;
  requires_comment: boolean;
}

export interface FieldDefinition {
  id: UUID;
  entity_type: string;
  field_key: string;
  label: string;
  input_type: string;
  is_mandatory: boolean;
  max_length: number | null;
  options: string[] | null;
  sort_order: number;
  visible_roles: string[];
  editable_roles: string[];
}

export interface AuditEvent {
  id: number;
  occurred_at: IsoDateTime;
  actor_id: UUID | null;
  actor_role: Role | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: UUID | null;
  position_id: UUID | null;
  candidate_id: UUID | null;
  facility_id: UUID | null;
  reason: string | null;
  result: 'success' | 'failure' | 'denied' | 'validation_error' | 'conflict';
  metadata: Record<string, unknown>;
}

export interface LegalDocument {
  id: UUID;
  key: string;
  title: string;
  version: string;
  body_md: string;
  status: 'draft' | 'published' | 'superseded';
  effective_from: string | null;
  published_at: IsoDateTime | null;
  updated_at: IsoDateTime;
}

export interface RetentionPolicy {
  id: UUID;
  data_category: string;
  legal_basis: string;
  purpose: string;
  retention_days: number;
  is_active: boolean;
  version: string;
}

/** A data-subject request as recorded against the clock the RPC sets. */
export interface DsrRequest {
  id: UUID;
  reference: string;
  subject_email: string;
  subject_name: string | null;
  subject_category: string;
  request_type: 'access' | 'correction' | 'erasure' | 'withdraw_consent' | 'grievance' | 'nominee';
  detail: string | null;
  status: 'open' | 'in_progress' | 'fulfilled' | 'partially_fulfilled' | 'rejected' | 'closed';
  statutory_due_at: IsoDateTime;
  fulfilled_at: IsoDateTime | null;
  response_summary: string | null;
  handler_id: UUID | null;
  created_at: IsoDateTime;
}

export interface SecurityIncident {
  id: UUID;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actor_user_id: UUID | null;
  actor_ip: string | null;
  target_entity_type: string | null;
  target_entity_id: UUID | null;
  detail: string;
  detected_at: IsoDateTime;
  acknowledged_at: IsoDateTime | null;
  acknowledged_by: UUID | null;
  closed_at: IsoDateTime | null;
}

/** One scheduled deletion, with the category that scheduled it. */
export interface RetentionItemRow {
  id: UUID;
  entity_type: string;
  entity_id: UUID;
  finalized_at: IsoDateTime;
  due_at: IsoDateTime;
  deleted_at: IsoDateTime | null;
  data_category: string | null;
}

// ---- joined read models -----------------------------------------------------

export interface PositionWithCandidates extends Position {
  candidates: (Candidate & { documents: CandidateDocument[] })[];
}

export interface PositionAdjustmentRow {
  id: UUID;
  position_id: UUID;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  authority_basis: string;
  adjusted_at: IsoDateTime;
}

export interface RequestDetail extends VacancyRequest {
  facility: Facility | null;
  positions: (PositionWithCandidates & {
    raised_by_name: string | null;
    adjustments: PositionAdjustmentRow[];
  })[];
  requester: { id: UUID; full_name: string; designation: string | null } | null;
}

export interface TaskListItem {
  task: ApprovalTask;
  entityLabel: string;
  entityNumber: string;
  facilityName: string;
  waitingSince: IsoDateTime;
  requestedByName: string | null;
  href: string;
  slaState: 'within' | 'warning' | 'overdue';
  positionId: UUID | null;
  /** The request that owns the record, so an action can revalidate the right page. */
  requestId: UUID;
}

export interface Ageing {
  total: number;
  stage: number;
  active: number;
  hold: number;
}

export interface Metrics {
  open_positions: number;
  awaiting_vacancy_approval: number;
  awaiting_candidate_approval: number;
  sourcing: number;
  shortlisted: number;
  awaiting_joining: number;
  on_hold: number;
  hired_fy: number;
  closed_fy: number;
  overdue_actions: number;
  candidates_without_photo: number;
  total_positions_in_fy: number;
}
