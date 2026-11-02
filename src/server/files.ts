import { db, adminDb } from './db';
import { getActor } from './session';
import { DOCUMENT_URL_TTL_SECONDS, MAX_UPLOAD_BYTES } from '@/lib/constants';
import { slug } from '@/lib/format';

/**
 * Candidate documents are personal data. Three rules govern every path here:
 *   1. the bucket is private and the path is facility-prefixed, so a storage
 *      policy can enforce the same scope the database enforces
 *   2. a preview is a short-lived signed URL, minted on click, never stored in
 *      the page and never handed to another role
 *   3. minting the URL is itself logged - an access record, not a free read
 */

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export type FileFailure = { ok: false; code: string; message: string };

export async function uploadCandidateDocument(args: {
  candidateId: string;
  facilityId: string;
  documentType: string;
  file: File;
}): Promise<{ ok: true; documentId: string; path: string } | FileFailure> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', message: 'Your session ended. Sign in again.' };
  if (actor.role !== 'HR' && actor.role !== 'HrHead' && actor.role !== 'Admin') {
    return { ok: false, code: 'forbidden', message: 'Only HR can attach candidate documents.' };
  }
  if (args.file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'validation', message: 'That file is larger than the 100 MB ceiling.' };
  }
  const ext = ALLOWED_MIME[args.file.type];
  if (!ext) {
    return {
      ok: false,
      code: 'validation',
      message: `Unsupported file type (${args.file.type || 'unknown'}). Use PDF, JPG, PNG or Word.`,
    };
  }

  const bucket = process.env.SUPABASE_DOC_BUCKET ?? 'candidate-documents';
  // the name is never the uploaded filename: those routinely carry a phone
  // number or an ID, and it would land in storage logs
  const path = `${args.facilityId}/${args.candidateId}/${slug(args.documentType)}-${Date.now()}.${ext}`;

  const client = await db();
  const { error: uploadError } = await client.storage.from(bucket).upload(path, args.file, {
    contentType: args.file.type,
    upsert: false,
    // private and never public-listable
    cacheControl: '0',
  });
  if (uploadError) {
    return { ok: false, code: 'upload_failed', message: `The upload did not complete: ${uploadError.message}` };
  }

  try {
    const documentId = await client
      .rpc('record_candidate_document', {
        p: {
          actor: actor.id,
          candidate_id: args.candidateId,
          document_type: args.documentType,
          file_path: path,
          file_name: `${slug(args.documentType)}.${ext}`,
          mime_type: args.file.type,
          size_bytes: args.file.size,
        },
      })
      .then((r) => {
        if (r.error) throw new Error(r.error.message);
        return (r.data as { id: string }).id;
      });
    return { ok: true, documentId, path };
  } catch (error) {
    // the file is orphaned; the retention worker collects these
    await client.storage.from(bucket).remove([path]);
    return { ok: false, code: 'validation', message: messageOf(error) };
  }
}

/**
 * Opens a document for one person for a few seconds. The refusal paths are the
 * point: Finance and Employee never reach here, and a facility outside the
 * actor's scope is denied before a URL exists.
 */
export async function openCandidateDocument(
  documentId: string,
  action: 'view' | 'download' = 'view',
): Promise<{ ok: true; url: string; expiresIn: number } | FileFailure> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', message: 'Your session ended. Sign in again.' };

  const client = await db();
  const { data } = await client
    .from('candidate_documents')
    .select('id, file_path, document_type, candidate:candidates(position:positions(facility_id, request_id))')
    .eq('id', documentId)
    .maybeSingle();

  // Supabase types an embed as an array without generated definitions, so the
  // projection is declared once here instead of asserted at every property read.
  type DocRow = {
    id: string;
    file_path: string;
    document_type: string;
    candidate?: { position?: { facility_id?: string; request_id?: string } } | null;
  };
  const doc = data as unknown as DocRow | null;

  if (!doc) return { ok: false, code: 'not_found', message: 'That document does not exist.' };

  const facilityId = doc.candidate?.position?.facility_id;
  if (!facilityId) return { ok: false, code: 'not_found', message: 'That document is no longer attached to a position.' };

  const ttl = Number(process.env.DOCUMENT_URL_TTL_SECONDS ?? DOCUMENT_URL_TTL_SECONDS);
  const bucket = process.env.SUPABASE_DOC_BUCKET ?? 'candidate-documents';

  // The database performs the scope test and writes the access log in one call,
  // so a URL is never issued without a record of who asked for it.
  const { error: logError } = await client.rpc('record_document_access', {
    p_document_id: documentId,
    p_actor: actor.id,
    p_action: action,
    p_ip: null,
    p_user_agent: null,
  });
  if (logError) {
    return { ok: false, code: /forbidden/i.test(logError.message) ? 'forbidden' : 'error', message: logError.message };
  }

  const ext = doc.file_path.split('.').pop() ?? 'pdf';
  const { data: signed, error } = await client.storage.from(bucket).createSignedUrl(doc.file_path, ttl, {
    download: action === 'download' ? `${slug(doc.document_type)}-${documentId.slice(0, 8)}.${ext}` : undefined,
  });
  if (error || !signed) {
    return { ok: false, code: 'error', message: 'The document could not be opened. Try again.' };
  }
  return { ok: true, url: signed.signedUrl, expiresIn: ttl };
}

/** Used by the export screens; exports are also private and expiring. */
export async function putReportExport(name: string, csv: string): Promise<{ url: string; expiresIn: number } | FileFailure> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', message: 'Your session ended. Sign in again.' };
  const bucket = process.env.SUPABASE_EXPORT_BUCKET ?? 'report-exports';
  const path = `${new Date().toISOString().slice(0, 10)}/${slug(actor.role)}-${slug(name)}.csv`;
  const client = adminDb();
  const { error } = await client.storage.from(bucket).upload(path, csv, {
    contentType: 'text/csv',
    upsert: true,
    cacheControl: '0',
  });
  if (error) return { ok: false, code: 'upload_failed', message: error.message };
  const { data, error: signError } = await client.storage.from(bucket).createSignedUrl(path, 300);
  if (signError || !data) return { ok: false, code: 'error', message: 'Export could not be prepared.' };
  return { url: data.signedUrl, expiresIn: 300 };
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^(validation|conflict|forbidden):\s*/i, '').slice(0, 300) || 'The upload could not be recorded.';
}
