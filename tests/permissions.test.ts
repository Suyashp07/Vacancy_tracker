/**
 * The permission catalogue, proved as a security invariant rather than as data.
 *
 * These keys are what the server checks before it touches the workflow, and what
 * the Admin screen renders as a matrix. If a role quietly acquired the power to
 * approve its own request, or the administrator acquired a hiring power, no page
 * would look different - so the check belongs here.
 */
import { describe, expect, it } from 'vitest';
import {
  LOCKED_FOR_ALL,
  PERMISSIONS,
  ROLE_LABEL,
  ROLE_PERMISSIONS,
  ROLES,
  can,
  navFor,
  type PermissionKey,
  type Role,
} from '@/lib/constants';

const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];
const keysOf = (role: Role) => new Set(ROLE_PERMISSIONS[role]);

describe('the role list', () => {
  it('names every role the database enum accepts, with words for the screen', () => {
    expect(ROLES).toEqual(['Admin', 'Owner', 'CEO', 'HR', 'HrHead', 'Finance', 'Employee']);
    for (const role of ROLES) {
      expect(ROLE_LABEL[role], `${role} has no display label`).toBeTruthy();
      expect(ROLE_PERMISSIONS[role], `${role} has no permission entry`).toBeDefined();
    }
  });

  it('grants each role something, because an empty role is a locked-out account', () => {
    for (const role of ROLES) expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
  });

  it('lists only keys that exist in the catalogue, so the matrix cannot lie', () => {
    for (const role of ROLES) {
      for (const key of ROLE_PERMISSIONS[role]) {
        expect(PERMISSION_KEYS, `${role} holds unknown permission ${key}`).toContain(key);
      }
      // A duplicated grant would make the matrix count a permission twice.
      expect(new Set(ROLE_PERMISSIONS[role]).size).toBe(ROLE_PERMISSIONS[role].length);
    }
  });
});

describe('can()', () => {
  it('refuses an unknown or absent role without throwing', () => {
    expect(can(undefined, 'approve_vacancy')).toBe(false);
    expect(can(null, 'approve_vacancy')).toBe(false);
    expect(can('Warehouse' as Role, 'approve_vacancy')).toBe(false);
  });

  it('is the exact mirror of the table', () => {
    for (const role of ROLES) {
      for (const key of PERMISSION_KEYS) {
        expect(can(role, key), `${role}/${key}`).toBe(keysOf(role).has(key) && !LOCKED_FOR_ALL.includes(key));
      }
    }
  });
});

describe('the prohibitions no configuration can lift', () => {
  it('refuses to turn off auth, auditing or privacy for anybody', () => {
    expect(LOCKED_FOR_ALL).toEqual([
      'disable_auth',
      'disable_audit_logging',
      'disable_privacy_controls',
    ]);
    for (const key of LOCKED_FOR_ALL) {
      for (const role of ROLES) {
        expect(can(role, key), `${role} may ${key}`).toBe(false);
      }
    }
  });

  it('keeps self-grant out of reach, including the administrator who owns the panel', () => {
    expect(LOCKED_FOR_ALL).toContain('disable_auth');
    expect(PERMISSIONS.grant_role_to_self).toBeTruthy();
    for (const role of ROLES) expect(can(role, 'grant_role_to_self')).toBe(false);
  });

  it('lists the locked keys in the catalogue so the matrix can show them as refused', () => {
    for (const key of LOCKED_FOR_ALL) expect(PERMISSION_KEYS).toContain(key);
  });
});

describe('separation of administration from hiring', () => {
  const HIRING: PermissionKey[] = [
    'raise_vacancy_request',
    'edit_own_draft',
    'approve_vacancy',
    'decide_candidate',
    'review_hold',
    'add_candidate',
    'submit_candidate',
    'confirm_joining',
    'close_position',
    'adjust_position_terms',
    'view_candidate_documents',
  ];

  it('gives the administrator no hiring power and no access to candidate documents', () => {
    for (const key of HIRING) expect(can('Admin', key), `Admin holds ${key}`).toBe(false);
    expect(can('Admin', 'manage_users_roles')).toBe(true);
    expect(can('Admin', 'view_audit_log')).toBe(true);
    expect(can('Admin', 'configure_retention')).toBe(true);
  });

  it('shows the administrator only the screens that hold that line', () => {
    expect(navFor('Admin')).toEqual(['dashboard', 'admin']);
    expect(navFor('Finance')).not.toContain('admin');
    expect(navFor(undefined)).toEqual([]);
  });

  it('routes every other role away from the configuration panel', () => {
    for (const role of ROLES.filter((r) => r !== 'Admin')) {
      expect(can(role, 'manage_users_roles'), `${role} may manage roles`).toBe(false);
      expect(can(role, 'manage_workflow')).toBe(false);
      expect(can(role, 'view_audit_log')).toBe(false);
      expect(navFor(role)).not.toContain('admin');
    }
  });
});

describe('who may decide about a person', () => {
  it('reserves vacancy approval to Owner and CEO', () => {
    expect(ROLES.filter((r) => can(r, 'approve_vacancy'))).toEqual(['Owner', 'CEO']);
  });

  it('reserves candidate decisions to the same two, and never to the requester alone', () => {
    expect(ROLES.filter((r) => can(r, 'decide_candidate'))).toEqual(['Owner', 'CEO']);
    for (const role of ROLES.filter((r) => can(r, 'raise_vacancy_request'))) {
      if (role === 'Owner' || role === 'CEO') continue;
      expect(can(role, 'decide_candidate'), `${role} raises and decides`).toBe(false);
    }
  });

  it('lets HR move a candidate and a position, but never approve either', () => {
    for (const role of ['HR', 'HrHead'] as Role[]) {
      expect(can(role, 'add_candidate')).toBe(true);
      expect(can(role, 'submit_candidate')).toBe(true);
      expect(can(role, 'approve_vacancy'), `${role} approves vacancies`).toBe(false);
      expect(can(role, 'decide_candidate'), `${role} decides candidates`).toBe(false);
    }
  });

  it('keeps document reading narrower than document uploading', () => {
    // Whoever can attach a CV is not automatically entitled to read every CV in
    // the company; the scope rule is exercised on the reads, this one on the grant.
    const readers = ROLES.filter((r) => can(r, 'view_candidate_documents'));
    expect(readers).not.toContain('Admin');
    expect(readers).not.toContain('Employee');
    expect(readers).not.toContain('Finance');
    expect(readers).toContain('HR');
  });

  it('gives Finance a money view and nothing else', () => {
    expect(ROLE_PERMISSIONS.Finance).toEqual(['review_budget', 'view_all_facilities', 'reports_export', 'activity_timeline']);
  });

  it('holds the privacy duties to the roles that carry them', () => {
    // Order follows the role list, which is also the order the matrix renders in.
    expect(ROLES.filter((r) => can(r, 'record_dsr'))).toEqual(['Admin', 'HrHead']);
    expect(ROLES.filter((r) => can(r, 'configure_retention'))).toEqual(['Admin']);
    expect(ROLES.filter((r) => can(r, 'view_security_incidents'))).toEqual(['Admin', 'Owner', 'CEO']);
  });
});
