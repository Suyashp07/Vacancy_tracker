'use client';

import { useTransition, useState } from 'react';
import { Download, FileText, ImageIcon, Loader2, ShieldCheck, Eye } from 'lucide-react';
import { Field, StatefulForm } from '@/components/stateful-form';
import { openDocument, uploadDocument, verifyDoc } from '@/server/actions';
import { fmtDate } from '@/lib/format';

/**
 * Candidate documents are the most sensitive bytes in the system, so this is
 * the only place a file name is ever turned into a URL: the mint is short-lived,
 * happens on the server, and each click writes an access record first.
 */

export interface DocView {
  id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  uploaded_at: string;
  verification_status: string;
  is_mandatory: boolean;
  is_exception: boolean;
  exception_reason: string | null;
}

export function DocumentRow({ doc, requestId }: { doc: DocView; requestId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function mint(action: 'view' | 'download') {
    start(async () => {
      const result = await openDocument(doc.id);
      if (result.ok && result.url) {
        setMessage(`Opening for ${result.expiresIn ?? 60} seconds. This access is logged.`);
        window.open(result.url, '_blank', 'noopener,noreferrer');
      } else {
        setMessage(result.message ?? 'The document could not be opened.');
      }
    });
  }

  const Glyph = doc.document_type === 'Photograph' ? ImageIcon : FileText;

  return (
    <div className={`doc ${doc.is_exception ? 'missing' : ''}`}>
      <span className="doc-ico">
        <Glyph size={15} />
      </span>
      <div className="grow">
        <div className="doc-name">
          {doc.document_type}
          {doc.is_mandatory ? <span className="tiny muted"> · mandatory</span> : null}
          {doc.is_exception ? <span className="badge warn">on exception</span> : null}
        </div>
        <div className="doc-meta">
          {fmtDate(doc.uploaded_at)} · {doc.verification_status}
          {doc.exception_reason ? ` · ${doc.exception_reason}` : ''}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn ghost sm" onClick={() => mint('view')} disabled={pending}>
          {pending ? <Loader2 size={13} className="pulse" /> : <Eye size={13} />}
          View
        </button>
        <button type="button" className="btn ghost sm" onClick={() => mint('download')} disabled={pending}>
          <Download size={13} />
          Save
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setOpen((v) => !v)}
          title="Verify or reject this document"
        >
          <ShieldCheck size={13} />
          Verify
        </button>
      </div>
      {message ? (
        <div className="tiny muted" style={{ gridColumn: '1 / -1' }}>
          {message}
        </div>
      ) : null}
      {open ? (
        <div className="row" style={{ gridColumn: '1 / -1', gap: 6 }}>
          {(['Verified', 'Under Review', 'Rejected'] as const).map((result) => (
            <button
              key={result}
              type="button"
              className={`btn sm ${result === 'Rejected' ? 'danger' : ''}`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const state = await verifyDoc(doc.id, requestId, result);
                  setMessage(state.message);
                  setOpen(false);
                })
              }
            >
              {result}
            </button>
          ))}
          <span className="tiny muted">Marking a document is recorded against your name.</span>
        </div>
      ) : null}
    </div>
  );
}

/** Attaching a document. The candidate and facility ride along as hidden ids. */
export function UploadDocumentForm({
  requestId,
  candidateId,
  facilityId,
  documentTypes,
}: {
  requestId: string;
  candidateId: string;
  facilityId: string;
  documentTypes: string[];
}) {
  return (
    <div className="card pad" style={{ background: 'var(--surface-alt)' }}>
      <StatefulForm
        action={uploadDocument}
        label="Attach document"
        resetOnSuccess
        intro="PDF, JPG, PNG or Word, up to 100 MB. The stored name is generated here - your file name never reaches storage."
      >
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="candidate_id" value={candidateId} />
        <input type="hidden" name="facility_id" value={facilityId} />
        <div className="fgrid">
          <Field
            name="document_type"
            label="Document type"
            required
            options={documentTypes.map((t) => ({ value: t, label: t }))}
          />
          <div className="field">
            <label htmlFor="file" className="req">
              File
            </label>
            <input id="file" name="file" className="input" type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            <span className="hint">Do not upload a document that contains an Aadhaar or PAN number.</span>
          </div>
        </div>
      </StatefulForm>
    </div>
  );
}
