import Link from 'next/link';
import { FileText, Scale, ShieldCheck } from 'lucide-react';
import './legal.css';
import { Badge, Card, Empty, PageHead } from '@/components/ui';
import { Markdown, markdownSummary } from '@/components/markdown';
import { ROLE_LABEL } from '@/lib/constants';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { getMyAcknowledgements, listLegalDocuments } from '@/server/policy';
import { requireActor, pendingAcknowledgement } from '@/server/session';
import type { LegalDocument } from '@/types/domain';

export const metadata = { title: 'Policies' };
export const dynamic = 'force-dynamic';

/**
 * The version of each policy that is currently in force. A key can hold several
 * rows; the one published last is what applies, and an older row is only shown
 * because an Admin is allowed to see drafts and superseded text.
 */
function currentPerKey(docs: LegalDocument[]): LegalDocument[] {
  const byKey = new Map<string, LegalDocument>();
  for (const doc of docs) {
    if (doc.status !== 'published') continue;
    const seen = byKey.get(doc.key);
    if (!seen) {
      byKey.set(doc.key, doc);
      continue;
    }
    const at = (d: LegalDocument) => new Date(d.published_at ?? d.effective_from ?? d.updated_at).getTime();
    if (at(doc) >= at(seen)) byKey.set(doc.key, doc);
  }
  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

const STATUS_TONE: Record<LegalDocument['status'], 'ok' | 'wait' | 'neutral'> = {
  published: 'ok',
  draft: 'wait',
  superseded: 'neutral',
};

export default async function LegalPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;

  const [docs, acks, pending] = await Promise.all([
    listLegalDocuments(),
    getMyAcknowledgements(),
    pendingAcknowledgement(actor),
  ]);

  const live = currentPerKey(docs);
  // An Admin may read a draft before it is published; nobody else receives the row at all.
  const library = actor.role === 'Admin' ? docs.filter((d) => d.status !== 'superseded') : live;
  const selected = library.find((d) => d.id === params.doc) ?? live[0] ?? null;

  return (
    <>
      <PageHead
        crumb="Accountability · Policies"
        title="Policies that govern this portal"
        note="These are the texts the portal is built to obey: what is collected about a candidate, who may open it, how long it survives and what happens when a person asks for it."
        right={
          pending ? (
            <Link href="/legal/acknowledge" className="btn primary">
              <Scale size={15} />
              Acknowledge {pending.version}
            </Link>
          ) : null
        }
      />

      {pending ? (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <ShieldCheck size={16} />
          <div>
            <strong>{pending.title}</strong> version {pending.version} applies to your account and has not been
            acknowledged. Hiring records stay read-only for you until it is accepted - the portal will not act on your
            approvals against a notice you have not been shown.
          </div>
        </div>
      ) : null}

      <div className="split">
        <div className="col" style={{ gap: 16 }}>
          {selected ? (
            <Card pad>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
                <div>
                  <div className="crumb">{selected.key.replace(/_/g, ' ')}</div>
                  <h2 style={{ margin: '2px 0 0', fontSize: 19, letterSpacing: '-0.02em' }}>{selected.title}</h2>
                  <div className="subrow" style={{ marginTop: 6 }}>
                    <span className="mono">version {selected.version}</span>
                    <span>·</span>
                    <span>
                      {selected.status === 'published'
                        ? `in force since ${fmtDate(selected.effective_from ?? selected.published_at)}`
                        : 'not in force'}
                    </span>
                    {selected.published_at ? (
                      <>
                        <span>·</span>
                        <span>published {fmtDateTime(selected.published_at)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="pcell" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge tone={STATUS_TONE[selected.status]} dot>
                    {selected.status}
                  </Badge>
                  {acks.has(selected.id) ? (
                    <Badge tone="ok">you accepted {fmtDate(acks.get(selected.id) ?? null)}</Badge>
                  ) : selected.status === 'published' ? (
                    <Badge tone="neutral">no acceptance recorded by you</Badge>
                  ) : null}
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--line)', margin: '16px 0 18px' }} />
              <Markdown source={selected.body_md} />
            </Card>
          ) : (
            <Card>
              <Empty
                title="No policy has been published yet"
                note="Until a privacy notice exists in the register, the portal cannot show a candidate their rights, and no acknowledgement can be recorded."
              />
            </Card>
          )}

          {selected && selected.status === 'published' && !acks.has(selected.id) ? (
            <div className="notice info">
              <FileText size={16} />
              <div>
                You have read this version but not accepted it. Acceptance is stored as its own consent record with the
                version and the time, so the evidence outlives the document that produced it.
              </div>
            </div>
          ) : null}
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card pad>
            <div className="section-head" style={{ margin: '0 0 10px' }}>
              <h2>The library</h2>
              <span className="note">{actor.role === 'Admin' ? 'all versions you may read' : 'in force'}</span>
            </div>
            {library.length === 0 ? (
              <Empty title="Nothing published" note="An Admin publishes a policy before it appears here." />
            ) : (
              library.map((d) => {
                const isCurrent = live.some((l) => l.id === d.id);
                return (
                  <Link
                    key={d.id}
                    href={`/legal?doc=${d.id}`}
                    className={`librow ${selected?.id === d.id ? 'sel' : ''}`.trim()}
                  >
                    <div className="pcell">
                      <span style={{ fontWeight: selected?.id === d.id ? 600 : 400 }}>{d.title}</span>
                      <span className="tiny muted">{markdownSummary(d.body_md, 96)}</span>
                    </div>
                    <div className="pcell" style={{ alignItems: 'flex-end', gap: 4 }}>
                      <span className="cell-id">v{d.version}</span>
                      {isCurrent ? null : <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>}
                      {acks.has(d.id) ? <Badge tone="ok">accepted</Badge> : null}
                    </div>
                  </Link>
                );
              })
            )}
          </Card>

          <Card pad>
            <div className="section-head" style={{ margin: '0 0 8px' }}>
              <h2>Why this is here, not in a PDF</h2>
            </div>
            <div className="col" style={{ gap: 9 }}>
              <Line k="Signed in" v={`You are reading as ${ROLE_LABEL[actor.role]}. The register decides which rows you can even see.`} />
              <Line
                k="Versioned"
                v="A new version re-asks everyone. An old acceptance is never reused as consent for text that came after it."
              />
              <Line
                k="Enforced"
                v="These are not descriptions of the rules - the same tables behind this page are what the database checks on every write."
              />
            </div>
            <div className="tiny muted" style={{ marginTop: 12 }}>
              Requests about your own data - access, correction, erasure - are handled by the Admin register and answered
              inside the portal, with the outcome kept as evidence.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="howrow">
      <Badge tone="info">{k}</Badge>
      <span className="muted">{v}</span>
    </div>
  );
}
