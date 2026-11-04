export default function AppLoading() {
  return (
    <div className="skeleton-page" style={{ padding: '8px 0', opacity: 0.85 }} aria-busy="true" aria-label="Loading page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 120, height: 12, borderRadius: 4, background: 'var(--line)', opacity: 0.6 }} />
        <div style={{ width: 240, height: 26, borderRadius: 6, background: 'var(--line)' }} />
        <div style={{ width: '60%', height: 14, borderRadius: 4, background: 'var(--line)', opacity: 0.5 }} />
      </div>

      <div
        style={{
          height: 280,
          borderRadius: 12,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="tiny muted" style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Loading workspace…
        </span>
      </div>
    </div>
  );
}
