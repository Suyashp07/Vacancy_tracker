import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NewRequestForm } from '@/components/new-request-form';
import { PageHead } from '@/components/ui';
import { can } from '@/lib/constants';
import { listFacilities, listLegalDocuments } from '@/server/policy';
import { requireActor } from '@/server/session';

export const metadata = { title: 'Raise a vacancy request' };
export const dynamic = 'force-dynamic';

export default async function NewRequestPage() {
  const actor = await requireActor();
  if (!can(actor.role, 'raise_vacancy_request')) {
    return (
      <>
        <PageHead
          crumb="Vacancy requests"
          title="This is not a form you are given"
          note="Raising a vacancy request is granted by role. Your role progresses or approves requests, it does not originate them."
          right={
            <Link href="/requests" className="btn">
              <ArrowLeft size={15} />
              Back to the register
            </Link>
          }
        />
        <div className="notice info">
          Ask an Owner, CEO or HR colleague to raise the requirement, and they will see it in their own queue with your
          name against it.
        </div>
      </>
    );
  }

  const [facilities, documents] = await Promise.all([listFacilities(), listLegalDocuments()]);
  const notice =
    documents.find((d) => d.status === 'published' && d.key === 'privacy_policy') ??
    documents.find((d) => d.status === 'published') ??
    null;

  return (
    <>
      <PageHead
        crumb="Vacancy requests"
        title="Raise a vacancy request"
        note="One request creates one position record per head. Each of them then moves through sourcing, approval and joining on its own clock."
        right={
          <Link href="/requests" className="btn ghost sm">
            <ArrowLeft size={15} />
            Register
          </Link>
        }
      />

      <NewRequestForm
        facilities={facilities.map((f) => ({ id: f.id, name: f.name, code: f.code }))}
        acknowledgementVersion={notice?.version ?? '1.0-draft'}
        acknowledgementTitle={notice?.title ?? 'Privacy notice and consent'}
      />
    </>
  );
}
