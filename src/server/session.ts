import { cache } from 'react';
import { redirect } from 'next/navigation';
import { db, adminDb } from './db';
import type { Actor } from '@/types/domain';
import type { WorkflowConfig, StepConfig, TransitionConfig } from './workflow-rules';
import type { Role } from '@/lib/constants';
import { can, CONSENT_GATE_KEYS, type PermissionKey } from '@/lib/constants';

export type Denial = { denied: true; reason: string; code: string };

const actorCache = new Map<string, { actor: Actor; expiresAt: number }>();
const workflowCache = new Map<string, { value: WorkflowConfig; expiresAt: number }>();
const fieldDefinitionsCache = new Map<string, { value: FieldDefinitionRow[]; expiresAt: number }>();

export function invalidateActorCache(userId?: string): void {
  if (userId) {
    actorCache.delete(userId);
  } else {
    actorCache.clear();
  }
}

export function invalidateWorkflowCache(): void {
  workflowCache.clear();
  fieldDefinitionsCache.clear();
}

/**
 * Resolves the signed-in person into an Actor: identity, role, facility scope,
 * and the legal-document version they still owe an acknowledgement for.
 *
 * Cached per request, so a page that needs it five times authenticates once.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  // A well-formed but expired token makes @supabase/ssr attempt a refresh that
  // can THROW (rather than return a null user). Because this runs on every page
  // via requireActor, an uncaught throw here turns into a 500 on /login, the
  // dashboard and everywhere else. Any auth failure is therefore treated as
  // "signed out" so the caller redirects to a fresh login instead of crashing.
  const client = await db().catch(() => null);
  if (!client) return null;

  const user = await client.auth
    .getUser()
    .then(({ data, error }) => (error ? null : data.user))
    .catch(() => null);
  if (!user) return null;

  const now = Date.now();
  const cached = actorCache.get(user.id);
  if (cached && now < cached.expiresAt) {
    return cached.actor;
  }

  // The profile read and the facility-scope read only depend on the user id, so
  // they go out together rather than one round-trip after the other.
  const [{ data: profile }, { data: facilityRows }] = await Promise.all([
    client
      .from('users')
      .select('id, email, full_name, role, primary_facility_id, department, designation, is_active')
      .eq('id', user.id)
      .maybeSingle(),
    client.from('user_facilities').select('facility_id').eq('user_id', user.id),
  ]);

  // authenticated in Auth but no provisioned profile is not an actor
  if (!profile || profile.is_active !== true) return null;

  const facilityIds = new Set<string>();
  if (profile.primary_facility_id) facilityIds.add(profile.primary_facility_id as string);
  for (const f of facilityRows ?? []) facilityIds.add(f.facility_id as string);

  const role = profile.role as Role;
  const isGlobal = ['Admin', 'Owner', 'CEO'].includes(role) || role === 'Finance';

  const actor: Actor = {
    id: profile.id as string,
    email: profile.email as string,
    name: profile.full_name as string,
    role,
    facilityIds: [...facilityIds],
    isGlobal,
    legalAckVersion: null,
  };

  actorCache.set(user.id, { actor, expiresAt: now + 30 * 1000 });
  return actor;
});

/** Page entry point. Anything unreachable without a session goes to /login. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/login');
  return actor;
}

/**
 * The authorization gate. Returns either the actor or a structured denial, and
 * writes the denial to the audit log so that a refused attempt is visible
 * evidence rather than a silent empty screen.
 */
export async function authorize(
  actor: Actor | null,
  permission: PermissionKey,
  context: { action: string; entityType: string; entityId?: string; note?: string } = {
    action: 'access.attempt',
    entityType: 'unknown',
  },
): Promise<{ ok: true; actor: Actor } | { ok: false; denial: Denial }> {
  if (!actor) {
    await recordDenial(null, { ...context, note: 'no session' }, 'unauthenticated');
    return { ok: false, denial: { denied: true, reason: 'Your session ended. Sign in again.', code: 'unauthenticated' } };
  }
  if (!can(actor.role, permission)) {
    await recordDenial(actor, context, 'forbidden');
    return {
      ok: false,
      denial: {
        denied: true,
        reason: `Your role (${actor.role}) is not permitted to ${permission.replace(/_/g, ' ')}.`,
        code: 'forbidden',
      },
    };
  }
  return { ok: true, actor };
}

export async function requirePermission(
  actor: Actor,
  permission: PermissionKey,
  context?: Parameters<typeof authorize>[2],
): Promise<void> {
  const result = await authorize(actor, permission, context);
  if (!result.ok) {
    throw new PermissionError(result.denial.reason, result.denial.code);
  }
}

export class PermissionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
  }
}

/** Denials are append-only evidence: this must never throw into the user path. */
async function recordDenial(
  actor: Actor | null,
  context: { action: string; entityType: string; entityId?: string; note?: string },
  code: string,
): Promise<void> {
  try {
    const client = await db();
    await client.rpc('record_denial', {
      p_action: context.action,
      p_entity_type: context.entityType,
      p_entity_id: context.entityId ?? null,
      p_actor: actor?.id ?? null,
      p_reason: `${code}: ${context.note ?? 'permission not held'}`,
      p_severity: code === 'unauthenticated' ? 'low' : 'high',
    });
  } catch {
    // a failed denial write must not become an information leak
  }
}

/** Facility scope helper used by every read. */
export function scopeFacilities(actor: Actor): { global: boolean; ids: string[] } {
  return { global: actor.isGlobal, ids: actor.facilityIds };
}

/**
 * True when the actor may see records belonging to this facility. Mirrors the
 * SQL can_view() function so a page and a policy never disagree.
 */
export function seesFacility(actor: Actor, facilityId: string | null | undefined): boolean {
  if (!facilityId) return false;
  if (actor.isGlobal) return true;
  return actor.facilityIds.includes(facilityId);
}

// ---------------------------------------------------------------------------
// workflow configuration (read once per request, then reused)
// ---------------------------------------------------------------------------
export const getWorkflow = cache(async (workflowKey: string): Promise<WorkflowConfig> => {
  const now = Date.now();
  const cached = workflowCache.get(workflowKey);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }
  const client = await db();
  const { data: definition } = await client
    .from('workflow_definitions')
    .select('id, key, name, entity_type')
    .eq('key', workflowKey)
    .maybeSingle();
  if (!definition) throw new Error(`Workflow ${workflowKey} is not configured. Re-run the seed.`);

  const [{ data: steps }, { data: transitions }] = await Promise.all([
    client.from('workflow_steps').select('*').eq('workflow_id', definition.id).order('sort_order'),
    client.from('workflow_transitions').select('*').eq('workflow_id', definition.id),
  ]);

  const config: WorkflowConfig = {
    key: definition.key as string,
    entity: definition.entity_type as 'vacancy_request' | 'position' | 'candidate',
    steps: (steps ?? []) as StepConfig[],
    transitions: (transitions ?? []) as TransitionConfig[],
  };
  workflowCache.set(workflowKey, { value: config, expiresAt: now + 5 * 60 * 1000 });
  return config;
});

export const getFieldDefinitions = cache(async (entityType: string): Promise<FieldDefinitionRow[]> => {
  const now = Date.now();
  const cached = fieldDefinitionsCache.get(entityType);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }
  const client = await db();
  const { data } = await client
    .from('workflow_field_definitions')
    .select('*')
    .eq('entity_type', entityType)
    .order('sort_order');
  const rows = (data ?? []) as FieldDefinitionRow[];
  fieldDefinitionsCache.set(entityType, { value: rows, expiresAt: now + 5 * 60 * 1000 });
  return rows;
});

export interface FieldDefinitionRow {
  id: string;
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

/** Fields this actor is actually allowed to see on a form. */
export function visibleFields(fields: FieldDefinitionRow[], role: Role): FieldDefinitionRow[] {
  return fields.filter((f) => f.visible_roles.length === 0 || f.visible_roles.includes(role));
}

export function editableFields(fields: FieldDefinitionRow[], role: Role): Set<string> {
  return new Set(
    fields
      .filter((f) => f.editable_roles.length === 0 || f.editable_roles.includes(role))
      .map((f) => f.field_key),
  );
}

/** The published legal document version the actor has not yet accepted. */
export async function pendingAcknowledgement(actor: Actor): Promise<{ id: string; title: string; version: string } | null> {
  const client = await db();
  const { data: published } = await client
    .from('legal_documents')
    .select('id, title, version, key')
    .eq('status', 'published')
    .in('key', [...CONSENT_GATE_KEYS])
    .order('effective_from', { ascending: false });

  if (!published || published.length === 0) return null;

  const docIds = published.map((d) => d.id as string);
  const { data: acks } = await client
    .from('legal_document_acks')
    .select('legal_document_id')
    .eq('user_id', actor.id)
    .in('legal_document_id', docIds);

  const ackedSet = new Set((acks ?? []).map((a) => a.legal_document_id as string));
  for (const doc of published) {
    if (!ackedSet.has(doc.id as string)) {
      return { id: doc.id as string, title: doc.title as string, version: doc.version as string };
    }
  }
  return null;
}

/** Service-role read, used only by the Admin accountability screens. */
export async function adminReadAudit(filters: {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const client = adminDb();
  let query = client
    .from('audit_events')
    .select('id, occurred_at, actor_id, actor_role, action, entity_type, entity_id, reason, result, metadata, request_id, position_id, candidate_id, facility_id')
    .order('occurred_at', { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.actorId) query = query.eq('actor_id', filters.actorId);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.entityId) query = query.eq('entity_id', filters.entityId);
  if (filters.from) query = query.gte('occurred_at', filters.from);
  if (filters.to) query = query.lte('occurred_at', filters.to);
  const { data, error } = await query;
  if (error) throw new Error(`Audit read failed: ${error.message}`);
  return data ?? [];
}
