import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="fallback">
      <div className="fallback-card">
        <div className="crumb">Yash Honda · Vacancy &amp; Hiring Tracker</div>
        <h1>Nothing at this address</h1>
        <p className="sub">
          The record may have been closed and archived, the link may be from an older version of the portal, or you may
          not be entitled to see it. Absence of a page is never shown as an error, because that would confirm a record
          exists.
        </p>
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <Link href="/dashboard" className="btn primary">
            Back to my dashboard
          </Link>
          <Link href="/requests" className="btn">
            Vacancy register
          </Link>
        </div>
      </div>
    </main>
  );
}
