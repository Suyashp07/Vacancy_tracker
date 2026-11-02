/**
 * Parity between the seeded workflow configuration and the code that runs it.
 *
 * The state machine is data: workflow_steps and workflow_transitions decide what
 * a status means, which move exists from it and who may perform it. So these
 * tests read the seed that creates those rows and check it against the type
 * definitions, the label catalogue and the permission table the application
 * enforces. A drift between the two - a status the UI has no word for, a
 * transition pointing at a stage that was never declared, an approver role that
 * holds no approving permission - fails here instead of in front of a user.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_LABEL,
  CANDIDATE_STATUSES,
  DOCUMENT_TYPES,
  FIELD_LABEL,
  POSITION_STATUSES,
  REQUEST_STATUSES,
  ROLES,
  can,
  type Role,
} from '@/lib/constants';
import type { StepConfig, TransitionConfig } from '@/server/workflow-rules';
import { seededConfig, seededFieldDefinitions, seededWorkflows, tableColumns } from './seed';

const config = seededConfig();
const definitions = seededWorkflows();

function stepsOf(workflowKey: string): StepConfig[] {
  return (config.get(`${workflowKey}:workflow_steps`)?.rows ?? []) as unknown as StepConfig[];
}

function transitionsOf(workflowKey: string): TransitionConfig[] {
  return (config.get(`${workflowKey}:workflow_transitions`)?.rows ?? []) as unknown as TransitionConfig[];
}

const WORKFLOWS = [
  { key: 'vacancy_request_default', entity: 'vacancy_request', statuses: REQUEST_STATUSES },
  { key: 'position_default', entity: 'position', statuses: POSITION_STATUSES },
  { key: 'candidate_default', entity: 'candidate', statuses: CANDIDATE_STATUSES },
] as const;

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

describe('the seeded workflow configuration', () => {
  it('declares exactly the three workflows the application evaluates', () => {
    expect(definitions.map((d) => d.key).sort()).toEqual([
      'candidate_default',
      'position_default',
      'vacancy_request_default',
    ]);
    for (const wf of WORKFLOWS) {
      const row = definitions.find((d) => d.key === wf.key);
      expect(row?.entity_type, `${wf.key} entity type`).toBe(wf.entity);
      expect(stepsOf(wf.key).length, `${wf.key} steps`).toBeGreaterThan(3);
      expect(transitionsOf(wf.key).length, `${wf.key} transitions`).toBeGreaterThan(3);
    }
  });

  it('names only statuses the domain types allow', () => {
    for (const wf of WORKFLOWS) {
      for (const step of stepsOf(wf.key)) {
        expect(
          (wf.statuses as readonly string[]).includes(step.status_key),
          `${wf.key}: ${step.status_key} is not a ${wf.entity} status`,
        ).toBe(true);
        expect(step.label, `${wf.key}.${step.status_key} has no label`).not.toBe('');
        expect(['approval', 'system']).toContain(step.step_type);
      }
    }
  });

  it('points every transition between stages that exist, and only the declared ones', () => {
    for (const wf of WORKFLOWS) {
      const declared = new Set(stepsOf(wf.key).map((s) => s.status_key));
      const stepByStatus = new Map(stepsOf(wf.key).map((s) => [s.status_key, s]));
      for (const t of transitionsOf(wf.key)) {
        expect(declared.has(t.from_status), `${wf.key}: from ${t.from_status} is undeclared`).toBe(true);
        expect(declared.has(t.to_status), `${wf.key}: to ${t.to_status} is undeclared`).toBe(true);
        // The step owns the list of moves it offers; a transition outside it would
        // be reachable in the database but never shown, i.e. a rule nobody can use.
        const step = stepByStatus.get(t.from_status);
        expect(step?.allowed_actions.includes(t.action), `${wf.key}: ${t.action} not allowed at ${t.from_status}`).toBe(
          true,
        );
      }
    }
  });

  it('gives every move a word to show the user and a colour that matches its weight', () => {
    const actions = new Set(WORKFLOWS.flatMap((wf) => transitionsOf(wf.key).map((t) => t.action)));
    for (const action of actions) {
      expect(ACTION_LABEL[action], `no label for action ${action}`).toBeTruthy();
    }
  });

  it('leaves no stage a person can enter but never escape, and no final stage with a door out', () => {
    for (const wf of WORKFLOWS) {
      const outgoing = new Map<string, TransitionConfig[]>();
      for (const t of transitionsOf(wf.key)) {
        outgoing.set(t.from_status, [...(outgoing.get(t.from_status) ?? []), t]);
      }
      for (const step of stepsOf(wf.key)) {
        const moves = outgoing.get(step.status_key) ?? [];
        if (step.is_terminal) {
          expect(moves.length, `${wf.key}.${step.status_key} is final but offers ${moves.length} move(s)`).toBe(0);
          expect(step.allowed_actions, `${wf.key}.${step.status_key} is final but lists actions`).toEqual([]);
        } else {
          expect(moves.length, `${wf.key}.${step.status_key} can never be left`).toBeGreaterThan(0);
        }
        // A declared action with no transition is a button that cannot work -
        // unless the action changes nothing at all. Editing a draft keeps the
        // record exactly where it is, so it is a permission, not a move.
        const NON_TRANSITIONING = ['edit'];
        for (const action of step.allowed_actions) {
          if (NON_TRANSITIONING.includes(action)) continue;
          expect(
            moves.some((t) => t.action === action),
            `${wf.key}.${step.status_key} offers ${action} with no transition behind it`,
          ).toBe(true);
        }
      }
      // Every non-terminal stage must be reachable, or it is dead configuration.
      const targets = new Set(transitionsOf(wf.key).map((t) => t.to_status));
      for (const step of stepsOf(wf.key)) {
        if (step.status_key === 'draft') continue;
        expect(targets.has(step.status_key), `${wf.key}.${step.status_key} can never be entered`).toBe(true);
      }
    }
  });

  it('keeps approval stages reserved to the two roles the permission table says may approve', () => {
    for (const wf of WORKFLOWS) {
      const permission = wf.entity === 'candidate' ? 'decide_candidate' : 'approve_vacancy';
      const holders = ROLES.filter((r) => can(r, permission));
      for (const step of stepsOf(wf.key).filter((s) => s.step_type === 'approval')) {
        const transitions = transitionsOf(wf.key).filter((t) => t.from_status === step.status_key);
        const roles = new Set(transitions.flatMap((t) => t.allowed_roles));
        expect([...roles].every(isRole), `${wf.key}.${step.status_key} lists an unknown role`).toBe(true);
        for (const role of roles) {
          expect(
            holders.includes(role as (typeof holders)[number]),
            `${wf.key}.${step.status_key}: ${role} decides without holding ${permission}`,
          ).toBe(true);
        }
        expect(step.allowed_roles.sort()).toEqual([...roles].sort());
      }
    }
  });

  it('never lets the administrator into a decision about a person', () => {
    // Administration is configuration and accountability. The seed must not offer
    // it a button that approves, rejects or confirms a joining.
    const DECISIONS = ['approve', 'approve_for_joining', 'confirm_joining', 'reject', 'reject_candidature'];
    for (const wf of WORKFLOWS) {
      for (const t of transitionsOf(wf.key)) {
        if (!DECISIONS.includes(t.action)) continue;
        expect(t.allowed_roles.includes('Admin'), `${wf.key}.${t.action} is open to Admin`).toBe(false);
      }
    }
  });

  it('keeps the administrator out of the workflow entirely, in either direction', () => {
    // The permission table gives Admin no hiring power, and every action handler
    // checks that table before it reaches the workflow. A seed that listed Admin
    // on a move would therefore promise a button the application refuses - the
    // configuration and the permission catalogue would disagree on screen.
    for (const wf of WORKFLOWS) {
      for (const t of transitionsOf(wf.key)) {
        expect(t.allowed_roles.includes('Admin'), `${wf.key}.${t.action} lists Admin`).toBe(false);
      }
      for (const step of stepsOf(wf.key)) {
        expect(step.allowed_roles.includes('Admin'), `${wf.key}.${step.status_key} lists Admin`).toBe(false);
      }
    }
  });

  it('offers every move only to roles whose permission table allows that kind of work', () => {
    // The workflow says who may act; the catalogue says what they are trusted
    // with at all. Where an action has a named permission, the two must agree.
    const ACTION_PERMISSION: Record<string, Parameters<typeof can>[1]> = {
      submit_for_vacancy_approval: 'raise_vacancy_request',
      approve: 'approve_vacancy',
      reject: 'approve_vacancy',
      return_for_information: 'approve_vacancy',
      approve_for_joining: 'decide_candidate',
      return_for_modifications: 'decide_candidate',
      add_candidate: 'add_candidate',
      submit_for_recruitment_approval: 'submit_candidate',
      submit_for_candidate_approval: 'submit_candidate',
      confirm_joining: 'confirm_joining',
      close_position: 'close_position',
      hold: 'review_hold',
      resume: 'review_hold',
    };
    for (const wf of WORKFLOWS) {
      for (const t of transitionsOf(wf.key)) {
        const permission = ACTION_PERMISSION[t.action];
        if (!permission) continue;
        for (const role of t.allowed_roles) {
          expect(
            can(role as Role, permission),
            `${wf.key}.${t.from_status} -> ${t.action} offers ${role}, which does not hold ${permission}`,
          ).toBe(true);
        }
      }
    }
  });

  it('requires a reason for every move that ends or damages something', () => {
    const DESTRUCTIVE = [
      'reject',
      'reject_candidature',
      'return_for_information',
      'return_for_modifications',
      'close',
      'close_position',
      'cancel',
      'hold',
      'withdraw_offer',
    ];
    for (const wf of WORKFLOWS) {
      for (const t of transitionsOf(wf.key)) {
        if (!DESTRUCTIVE.includes(t.action)) continue;
        expect(t.requires_reason, `${wf.key}.${t.from_status} -> ${t.action} needs no reason`).toBe(true);
      }
    }
  });

  it('asks only real columns and only configured document types', () => {
    const fields = seededFieldDefinitions();
    const columnsByEntity = {
      vacancy_request: tableColumns('vacancy_requests'),
      position: [...tableColumns('positions'), ...tableColumns('vacancy_requests'), ...tableColumns('candidates')],
      candidate: tableColumns('candidates'),
    };
    for (const wf of WORKFLOWS) {
      const known = new Set([...columnsByEntity[wf.entity], ...(fields.get(wf.entity) ?? [])]);
      for (const step of stepsOf(wf.key)) {
        for (const field of step.required_fields) {
          // A required field the record cannot carry would block this stage for
          // everyone, forever, with a message naming something the user never saw.
          expect(known.has(field), `${wf.key}.${step.status_key} requires ${field}, which no source row holds`).toBe(
            true,
          );
        }
        for (const doc of step.required_documents) {
          expect((DOCUMENT_TYPES as readonly string[]).includes(doc), `${doc} is not a document type`).toBe(true);
        }
      }
    }
  });

  it('labels every gateable field in the administrator\u2019s own vocabulary', () => {
    // The refusal sentence is built from fieldLabel(); a field missing from the
    // catalogue still reads acceptably, but the register must not run out of words.
    const mentioned = new Set(
      WORKFLOWS.flatMap((wf) => stepsOf(wf.key).flatMap((s) => s.required_fields as string[])),
    );
    for (const field of mentioned) {
      expect(FIELD_LABEL[field] ?? null, `no explicit label for ${field} (falls back to spacing)`).toBeDefined();
    }
    expect(mentioned.size).toBeGreaterThan(8);
  });

  it('lists only known roles on every step, so a rule is never addressed to nobody', () => {
    for (const wf of WORKFLOWS) {
      for (const step of stepsOf(wf.key)) {
        expect(step.allowed_roles.length, `${wf.key}.${step.status_key} lists no role at all`).toBeGreaterThan(0);
        for (const role of step.allowed_roles) {
          expect(isRole(role), `${wf.key}.${step.status_key} lists unknown role ${role}`).toBe(true);
        }
        for (const t of transitionsOf(wf.key).filter((x) => x.from_status === step.status_key)) {
          for (const role of t.allowed_roles) {
            expect(isRole(role), `${wf.key}.${t.action} lists unknown role ${role}`).toBe(true);
          }
        }
      }
    }
  });

  it('keeps the mandatory DPDP documents attached to the stage that sends a candidate for approval', () => {
    const candidateSteps = stepsOf('candidate_default');
    const submissionTargets = new Set(
      transitionsOf('candidate_default')
        .filter((t) => t.action === 'submit_for_recruitment_approval')
        .map((t) => t.to_status),
    );
    expect([...submissionTargets]).toEqual(['submitted_for_recruitment_approval']);
    for (const step of candidateSteps.filter((s) => submissionTargets.has(s.status_key) || s.status_key === 'draft')) {
      for (const doc of ['Resume', 'Photograph']) {
        expect(
          step.required_documents.includes(doc),
          `candidate stage ${step.status_key} can be entered without a ${doc}`,
        ).toBe(true);
      }
    }
  });
});
