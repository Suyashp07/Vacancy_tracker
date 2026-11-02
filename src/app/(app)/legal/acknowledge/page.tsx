import Link from 'next/link';
import { CheckCircle2, Scale } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Markdown } from '@/components/markdown';
import { Badge, Card, Empty, PageHead } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { listLegalDocuments } from '@/server/policy';
import { requireActor, pendingAcknowledgement } from '@/server/session';
import { acknowledgeLegal } from '@/server/actions';

export const metadata = { title: 'Acknowledge policy' };
export const dynamic = 'force-dynamic';

/**
 * The one screen that gates the whole portal. A new version of the privacy notice
 * is a new processing purpose, so consent is asked for again rather than assumed -
 * and until it is given, no approval action is honoured.
 */
export default async function AcknowledgePage() {
  const actor = await requireActor();
  const pending = await pendingAcknowledgement(actor);

  if (!pending) {
    return (
      <>
        <PageHead crumb="Accountability · Consent" title="Nothing to acknowledge" />
        <div className="fcard">
          <Card pad>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--ok)',
                  flex: 'none',
                }}
              >
                <CheckCircle2 size={19} />
              </span>
              <div>
                <div className="cell-main">Every policy that applies to you has been accepted</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  Your consent evidence stays in the register with its version and timestamp, and is retained on its own
                  period.
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <Link href="/dashboard" className="btn primary sm">
                Back to work
              </Link>
              <Link href="/legal" className="btn ghost sm">
                Read the policies again
              </Link>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const documents = await listLegalDocuments();
  const document = documents.find((d) => d.id === pending.id) ?? null;

  return (
    <>
      <PageHead
        crumb="Accountability · Consent"
        title={`Accept ${pending.title}`}
        note="This is a consent request, not a terms update. Accepting it tells the portal that the notice below is the one your data is being handled under."
        right={
          <Badge tone="wait" dot>
            version {pending.version} outstanding
          </Badge>
        }
      />

      <div className="fcard">
        <Card pad>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <Scale size={17} />
            <div className="cell-main">{pending.title}</div>
            <span className="mono tiny muted">version {pending.version}</span>
            {document?.effective_from ? (
              <span className="tiny muted">in force since {fmtDate(document.effective_from)}</span>
            ) : null}
          </div>

          {document ? (
            <Markdown source={document.body_md} />
          ) : (
            <Empty
              title="The text of this version could not be read"
              note="Acceptance is still required, so the requirement is stated above. Ask the Portal Admin to publish the body before signing."
            />
          )}

          <div style={{ height: 1, background: 'var(--line)', margin: '20px 0' }} />

          <div className="section-head" style={{ margin: '0 0 10px' }}>
            <h2>What accepting does</h2>
            <span className="note">stated plainly, in this interface</span>
          </div>
          <div className="col" style={{ gap: 8, marginBottom: 18 }}>
            <Agree k="Applies to you" v={`Recorded against your account (${actor.email}) with the version and the time, as ${pending.title} version ${pending.version}.`} />
            <Agree k="Unlocks your actions" v="Until it is accepted, the portal keeps the record readable but will not carry out an approval, a decision or a hold that you start." />
            <Agree k="Does not cover the past" v="Decisions you already took stay under the notice that was in force when you took them. A new version never rewrites history." />
            <Agree k="Can be withdrawn" v="Leaving the organisation, or an erasure request against your own data, stops the processing that this consent justified. Hiring records the company must keep are kept for that legal reason instead." />
          </div>

          <ActionForm
            run={acknowledgeLegal}
            args={[pending.id]}
            label="Accept this notice"
            variant="primary"
            submitLabel="Record my acceptance"
            successHref="/legal"
            intro="The entry written is a consent record: your account, the document version and the timestamp. It is kept as evidence even after the data it covers is deleted."
          >
            <label className="checkline" htmlFor="read_acknowledged">
              <input type="checkbox" id="read_acknowledged" name="read_acknowledged" required />
              <span>
                I have read {pending.title}, version {pending.version}, in full.
              </span>
            </label>
          </ActionForm>

          <div className="tiny muted" style={{ marginTop: 12 }}>
            Read {document?.published_at ? `published ${fmtDateTime(document.published_at)}` : 'and held in the register'} ·
            an acceptance can be re-requested only by publishing a new version.
          </div>
        </Card>
      </div>
    </>
  );
}

function Agree({ k, v }: { k: string; v: string }) {
  return (
    <div className="howrow">
      <Badge tone="neutral">{k}</Badge>
      <span className="muted">{v}</span>
    </div>
  );
}
