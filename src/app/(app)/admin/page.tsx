import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import './admin.css';
import { PageHead, Tabs } from '@/components/ui';
import { can } from '@/lib/constants';
import { requireActor } from '@/server/session';
import { AccessPanel, AuditPanel, FacilitiesPanel, LegalPanel, PrivacyPanel, UsersPanel, WorkflowPanel } from './panels';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

/**
 * One address, seven registers. The tab is a query parameter rather than a
 * client-side toggle so that an inactive register runs no queries at all, and so
 * a filtered audit view or a chosen policy version is a link someone can be sent.
 */
const TABS: { key: string; label: string }[] = [
  { key: 'users', label: 'Accounts' },
  { key: 'access', label: 'Access' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'legal', label: 'Policies' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'audit', label: 'Audit log' },
];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cat?: string; q?: string; result?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;

  // Configuration is a separate grant from hiring. The check happens here, on the
  // server, before a single register is queried - the nav hides the link, which
  // is presentation, not protection.
  if (!can(actor.role, 'manage_users_roles')) {
    return (
      <>
        <PageHead
          crumb="Accountability · Admin"
          title="Administration is not hiring"
          note="Roles, workflow configuration, the legal register and the audit log are granted separately from the power to approve a candidate. Your role carries the second without the first."
          right={
            <Link href="/dashboard" className="btn">
              <ArrowLeft size={15} />
              Back to your workspace
            </Link>
          }
        />
        <div className="notice info">
          Everything you are entitled to act on is already in your own queue. If something here looks like it should be
          yours, that is a decision for the system owner to record, not a setting to find.
        </div>
      </>
    );
  }

  const active = TABS.some((t) => t.key === params.tab) ? (params.tab as string) : 'users';

  return (
    <>
      <PageHead
        crumb="Accountability · Admin"
        title="The register behind the portal"
        note="These are the tables the workflow actually reads: who holds which role, what each role may do, which transitions are configured, which policy version is in force and how long every record survives. Nothing here is a copy of the rules - it is the rules, and every change on this page writes its own audit entry."
      />

      <Tabs tabs={TABS} active={active} base="/admin" />

      <div style={{ marginTop: 18 }}>
        {active === 'users' ? <UsersPanel actor={actor} /> : null}
        {active === 'access' ? <AccessPanel /> : null}
        {active === 'workflow' ? <WorkflowPanel /> : null}
        {active === 'facilities' ? <FacilitiesPanel /> : null}
        {active === 'legal' ? <LegalPanel /> : null}
        {active === 'privacy' ? <PrivacyPanel actor={actor} /> : null}
        {active === 'audit' ? (
          <AuditPanel params={{ cat: params.cat, q: params.q, result: params.result }} />
        ) : null}
      </div>
    </>
  );
}
