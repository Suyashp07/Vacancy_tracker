import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { PageHead } from '@/components/ui';
import { can } from '@/lib/constants';
import { fiscalYearLabel, recentFyTags } from '@/lib/format';
import { listFacilities, listRequests } from '@/server/policy';
import { requireActor } from '@/server/session';
import { RequestsRegister } from './requests-register';

export const metadata = { title: 'Vacancy requests' };
export const dynamic = 'force-dynamic';

type Params = { q?: string; tab?: string; facility?: string; fy?: string; sort?: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const tags = recentFyTags();
  const fy = tags.includes(params.fy ?? '') ? (params.fy as string) : tags[0];

  const [rows, facilities] = await Promise.all([
    listRequests(actor, { status: 'all', search: params.q, facilityId: params.facility, fy }),
    listFacilities(),
  ]);

  const scopeNote =
    actor.role === 'Employee'
      ? 'You see requests you raised. Anything another person started is not listed, not even by number.'
      : can(actor.role, 'view_all_facilities')
        ? 'Every facility is in your scope. Row visibility is decided in Postgres, not in this page.'
        : 'Scoped view - only the facilities assigned to you, plus requests you raised yourself.';

  return (
    <>
      <PageHead
        crumb={`Register · Fiscal year ${fiscalYearLabel(fy)}`}
        title="Vacancy requests"
        note={`${rows.length} request(s) in this view. ${scopeNote}`}
        right={
          <div className="row" style={{ gap: 8 }}>
            {can(actor.role, 'reports_export') ? (
              <a href="/api/export?type=requests" download className="btn sm ghost" title="Export as CSV">
                <Download size={14} />
                Export CSV
              </a>
            ) : null}
            {can(actor.role, 'raise_vacancy_request') ? (
              <Link href="/requests/new" className="btn primary sm">
                <Plus size={15} />
                New vacancy request
              </Link>
            ) : null}
          </div>
        }
      />

      <RequestsRegister
        rows={rows}
        facilities={facilities}
        params={params}
        tags={tags}
        fy={fy}
        scopeNote={scopeNote}
      />
    </>
  );
}
