/* Shared shell + interaction primitives for all prototype pages. */
(function () {
  const ICONS = {
    dash: 'M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z',
    req: 'M9 3h6l3 3v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6zM9 10h6M9 14h6',
    task: 'M4 6h5M4 12h5M4 18h5M12 6h8M12 12h8M12 18h8',
    hold: 'M10 4h4v16h-4zM6 4h2v16H6zM16 4h2v16h-2z',
    closed: 'M4 6h16v13H4zM9 10l6 5M15 10l-6 5',
    admin: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 12l1.8 1.8L15 10',
    bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a2 2 0 0 0 3 0',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14',
    chev: 'M9 6l6 6-6 6',
    doc: 'M7 3h7l4 4v14H7zM14 3v4h4',
    user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21c0-4 3.6-6 8-6s8 2 8 6',
    shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3.5 2',
    check: 'M4 12.5l5 5L20 6.5',
    x: 'M6 6l12 12M18 6L6 18',
    arr: 'M5 12h14M13 6l6 6-6 6',
    filter: 'M4 6h16M7 12h10M10 18h4',
    gavel: 'M4 20h9M8.5 4.5l7 7M6 9l6-6 3 3-6 6z',
    grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18'
  };
  const svg = (d, s) => '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';

  const NAV = [
    { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: 'dash' },
    { key: 'requests', href: 'requests.html', label: 'Vacancy Requests', icon: 'req', count: () => YH.requests.filter(r => r.status === 'pending').length },
    { key: 'my-actions', href: 'my-actions.html', label: 'My Actions', icon: 'task', count: (v) => YH.tasks(v).length, risk: true },
    { key: 'on-hold', href: 'request-detail.html', label: 'On Hold', icon: 'hold', count: () => YH.positions.filter(YH.isHold).length },
    { key: 'closed', href: 'requests.html', label: 'Closed Requests', icon: 'closed' },
    { key: 'admin', href: 'admin.html', label: 'Admin Panel', icon: 'admin', adminOnly: true }
  ];

  let viewer = localStorage.getItem('yh.viewer') || 'u-owner';
  const setViewer = (id) => { viewer = id; localStorage.setItem('yh.viewer', id); location.reload(); };
  const getViewer = () => viewer;

  function shell(active, title, crumb) {
    const v = YH.usr(viewer);
    const isEmp = v.role === 'Employee';
    const items = NAV.filter(n => !n.adminOnly || v.role === 'Admin')
      .map(n => {
        const c = n.count ? n.count(viewer) : null;
        return '<a class="nav-item' + (n.key === active ? ' active' : '') + '" href="' + (n.key === 'requests' && active === 'detail' ? 'requests.html' : n.href) + '">' +
          svg(ICONS[n.icon]) + '<span>' + n.label + '</span>' +
          (c ? '<span class="nav-count' + (n.risk ? ' risk' : '') + '">' + c + '</span>' : '') + '</a>';
      }).join('');

    document.body.insertAdjacentHTML('afterbegin',
      '<div class="shell"><aside class="side">' +
      '<div class="brand"><div class="brand-mark">YH</div>' +
      '<div class="brand-name">Yash Honda</div><div class="brand-sub">Vacancy &amp; Hiring Tracker</div></div>' +
      '<nav class="nav"><div class="nav-label">Workspace</div>' + items +
      '<div class="nav-label">Reference</div>' +
      '<a class="nav-item" href="admin.html">' + svg(ICONS.shield) + '<span>Legal &amp; Privacy</span></a>' +
      '<a class="nav-item" href="admin.html">' + svg(ICONS.grid) + '<span>System &amp; Audit Log</span></a>' +
      '</nav>' +
      '<div class="side-foot"><div class="identity"><div class="avatar">' + v.initials + '</div>' +
      '<div><div class="identity-name">' + v.name + '</div><div class="identity-role">' + v.role + (isEmp ? ' · requester' : '') + '</div></div></div></div>' +
      '</aside><div class="main">' +
      '<header class="topbar"><div><div class="crumb">' + (crumb || 'Yash Honda · internal') + '</div><h1 class="page-title">' + title + '</h1></div>' +
      '<div class="topbar-right">' + periodSlot(active) + viewerSlot(v) + '</div></header>' +
      '<main class="content" id="content"></main></div></div>' +
      '<div class="scrim" id="scrim" onclick="YHUI.closeAll()"></div>' +
      '<aside class="drawer" id="drawer"></aside>' +
      '<div class="modal" id="modal"></div>' +
      '<div class="toast" id="toast"><span class="tick"></span><span id="toast-text"></span></div>');

    document.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
      document.querySelectorAll('[data-period]').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); YHUI.toast('Reporting period set to ' + b.textContent.trim() + ' · ' + YH.FY.label);
    });
  }

  const periodSlot = (active) => active === 'admin' ? '' :
    '<div class="period">' + ['This week', 'This month', 'Quarter', 'YTD', 'Full FY', 'Custom'].map((p, i) =>
      '<button data-period="' + p + '"' + (i === 4 ? ' class="on"' : '') + '>' + p + '</button>').join('') + '</div>';

  const viewerSlot = (v) =>
    '<div style="position:relative">' +
    '<button class="btn sm" onclick="YHUI.toggleViewer(this)"><span class="avatar" style="width:20px;height:20px;font-size:9.5px">' + v.initials + '</span>' + v.role +
    '<span style="opacity:.5">' + svg(ICONS.chev, 13) + '</span></button>' +
    '<div id="vsw" style="display:none;position:absolute;right:0;top:34px;z-index:70;min-width:236px" class="card pad">' +
    '<div class="nav-label" style="padding:0 0 8px">Prototype · sign in as</div>' +
    YH.users.slice(0, 6).map(u => '<a class="nav-item" href="#" onclick="YHUI.setViewer(\'' + u.id + '\');return false" style="padding:6px 8px">' +
      '<span class="avatar" style="width:22px;height:22px;font-size:9.5px">' + u.initials + '</span><span>' + u.name + '</span>' +
      '<span class="nav-count">' + u.role + '</span></a>').join('') + '</div></div>';

  function toggleViewer() {
    const el = document.getElementById('vsw');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    if (el.style.display === 'block') setTimeout(() => document.addEventListener('click', function h(e) {
      if (!el.contains(e.target)) { el.style.display = 'none'; document.removeEventListener('click', h); }
    }), 0);
  }

  // ---------- overlays ----------
  const scrim = () => document.getElementById('scrim');
  function openDrawer(html) {
    const d = document.getElementById('drawer');
    d.innerHTML = html; d.classList.add('on'); scrim().classList.add('on');
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = closeAll);
  }
  function openModal(html) {
    const m = document.getElementById('modal');
    m.innerHTML = html; m.classList.add('on'); scrim().classList.add('on');
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = closeAll);
  }
  function closeAll() {
    document.getElementById('drawer').classList.remove('on');
    document.getElementById('modal').classList.remove('on');
    scrim().classList.remove('on');
  }
  let tHandle;
  function toast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').textContent = msg;
    t.classList.add('on'); clearTimeout(tHandle);
    tHandle = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ---------- formatting ----------
  const inr = (n) => n === 0 ? '0' : '₹' + n.toLocaleString('en-IN');
  const band = (a, b) => (a === 0 && b === 0) ? 'No incentive' : inr(a) + ' – ' + inr(b);
  const date = (iso) => iso ? new Date(iso.length > 10 ? iso : iso + 'T00:00:00+05:30')
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const ago = (iso) => { const d = YH.days(iso); return d === 0 ? 'today' : d + (d === 1 ? ' day' : ' days') + ' ago'; };
  const badge = (key, extra) => {
    const s = YH.STATUS[key] || { label: key, cls: '' };
    return '<span class="badge ' + s.cls + '"><span class="dot"></span>' + s.label + (extra ? ' · ' + extra : '') + '</span>';
  };
  const ageTag = (iso, sla) => {
    const d = YH.days(iso);
    const cls = sla ? (d > sla ? 'risk' : d > Math.round(sla * 0.6) ? 'warn' : 'sub') : 'sub';
    const txt = sla && d > sla ? ' · Overdue' : '';
    return '<span class="age ' + cls + '"><span class="bar"><i style="width:' + Math.min(100, sla ? (d / sla) * 100 : d * 4) + '%"></i></span>' +
      '<span class="tnum">' + d + 'd</span> waiting' + txt + '</span>';
  };
  const docPill = (has, label) => has
    ? '<span class="badge ok">' + svg(ICONS.check, 12) + ' ' + label + '</span>'
    : '<span class="badge risk">' + svg(ICONS.x, 12) + ' ' + label + ' missing</span>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  window.YHUI = { ICONS, svg, shell, setViewer, getViewer, toggleViewer, openDrawer, openModal, closeAll, toast, inr, band, date, ago, badge, ageTag, docPill, esc };
})();
