import { db, adminDb } from './db';
import { requireActor } from './session';
import { can } from '@/lib/constants';
import { listRequests, getAuditEvents, listUsers } from './policy';
import { putReportExport } from './files';
import { fmtDate, daysSince } from '@/lib/format';
import type { Actor, AuditEvent } from '@/types/domain';

export type ExportType = 'requests' | 'candidates' | 'audit';

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export async function generateExportCsv(
  actor: Actor,
  type: ExportType,
): Promise<{ csv: string; filename: string }> {
  if (!can(actor.role, 'reports_export')) {
    throw new Error('Your role is not entitled to generate report exports.');
  }

  const today = new Date().toISOString().slice(0, 10);
  let csv = '';
  let filename = `yash-honda-${type}-${today}.csv`;

  if (type === 'requests') {
    const rows = await listRequests(actor, { status: 'all' });
    const headers = [
      'Request Number',
      'Title',
      'Facility',
      'Role / Position Type',
      'Reason',
      'Status',
      'Quantity',
      'Open Positions',
      'CTC Floor (₹)',
      'CTC Ceiling (₹)',
      'Urgent',
      'Target Fill Date',
      'Raised By',
      'Submitted At',
      'Calendar Age (Days)',
    ];

    const dataLines = rows.map((r) => [
      r.request.number,
      r.request.title,
      r.facility?.name ?? 'Unassigned',
      r.request.position_type,
      r.request.reason,
      r.request.status,
      r.request.quantity,
      r.openPositions,
      r.request.ctc_min ?? '',
      r.request.ctc_max ?? '',
      r.request.is_urgent ? 'Yes' : 'No',
      r.request.target_fill_date ? fmtDate(r.request.target_fill_date) : '',
      r.raisedByName ?? '',
      r.request.submitted_at ? fmtDate(r.request.submitted_at) : '',
      r.request.submitted_at ? daysSince(r.request.submitted_at) : '',
    ]);

    csv = [toCsvRow(headers), ...dataLines.map(toCsvRow)].join('\r\n');
  } else if (type === 'candidates') {
    // DPDP protection: Finance and Employee are strictly barred from candidate personal details
    const allowPii = can(actor.role, 'view_candidate_documents') || actor.role === 'Admin';

    const client = await db();
    const { data: rawCandidates } = await client
      .from('candidates')
      .select(
        'id, full_name, status, expected_ctc, experience_text, current_location, notice_period_days, source, created_at, decision_at, position:positions(id, position_number, facility_id, facility:facilities(name), request:vacancy_requests(number, title))',
      )
      .order('created_at', { ascending: false });

    type EmbeddedCandidate = {
      id: string;
      full_name: string;
      status: string;
      expected_ctc: number | null;
      experience_text: string | null;
      current_location: string | null;
      notice_period_days: number | null;
      source: string | null;
      created_at: string;
      decision_at: string | null;
      position?: {
        id: string;
        position_number: string;
        facility_id: string;
        facility?: { name: string } | null;
        request?: { number: string; title: string } | null;
      } | null;
    };

    const candidates = (rawCandidates ?? []) as unknown as EmbeddedCandidate[];

    // Facility scope filter
    const visible = candidates.filter((c) => {
      if (actor.isGlobal) return true;
      const fid = c.position?.facility_id;
      return fid ? actor.facilityIds.includes(fid) : false;
    });

    const headers = [
      'Candidate Name',
      'Status',
      'Position Number',
      'Request Number',
      'Request Title',
      'Facility',
      'Current Location',
      'Expected CTC (₹)',
      'Notice Period (Days)',
      'Source',
      'Applied Date',
      'Decision Date',
    ];

    const dataLines = visible.map((c) => [
      allowPii ? c.full_name : `Candidate ${c.id.slice(0, 8)}`,
      c.status,
      c.position?.position_number ?? '',
      c.position?.request?.number ?? '',
      c.position?.request?.title ?? '',
      c.position?.facility?.name ?? '',
      allowPii ? (c.current_location ?? '') : '[Redacted]',
      c.expected_ctc ?? '',
      c.notice_period_days ?? '',
      c.source ?? '',
      fmtDate(c.created_at),
      c.decision_at ? fmtDate(c.decision_at) : '',
    ]);

    csv = [toCsvRow(headers), ...dataLines.map(toCsvRow)].join('\r\n');
  } else if (type === 'audit') {
    if (actor.role !== 'Admin' && actor.role !== 'Owner' && actor.role !== 'CEO') {
      throw new Error('Only Admin, Owner or CEO may export the system audit log.');
    }

    const [events, users] = await Promise.all([getAuditEvents({ limit: 1000 }), listUsers()]);
    const userMap = new Map(users.map((u) => [u.id, u.full_name]));

    const headers = [
      'Timestamp (UTC)',
      'Action',
      'Actor Role',
      'Actor Name',
      'Actor ID',
      'Entity Type',
      'Entity ID',
      'Result',
      'Reason',
    ];

    const dataLines = events.map((e) => [
      e.occurred_at,
      e.action,
      e.actor_role ?? '',
      e.actor_id ? (userMap.get(e.actor_id) ?? 'Unknown') : 'System',
      e.actor_id ?? '',
      e.entity_type,
      e.entity_id ?? '',
      e.result,
      e.reason ?? '',
    ]);

    csv = [toCsvRow(headers), ...dataLines.map(toCsvRow)].join('\r\n');
  } else {
    throw new Error(`Unknown export type: ${type}`);
  }

  // Backup export file to private storage bucket and log audit event
  try {
    await putReportExport(type, csv);
    const admin = adminDb();
    await admin.from('audit_events').insert({
      actor_id: actor.id,
      actor_role: actor.role,
      action: 'report.export',
      entity_type: 'report',
      entity_id: type,
      result: 'success',
      reason: `User generated ${type} CSV export`,
      metadata: { type, filename, actor_email: actor.email },
    });
  } catch {
    // Non-blocking for export delivery
  }

  return { csv, filename };
}
