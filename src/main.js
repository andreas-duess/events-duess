import './styles.css';
import { EVENTS, SECTORS, REGIONS, MONTHS, FAS_MILESTONES } from './data/events.js';
import { renderWorldMapSvg } from './engine/map.js';
import { generateIcs, generateCsv } from './engine/ics.js';

const STORAGE_KEY = 'events_duess_saved_2027';

function loadSavedIds() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('saved');
  if (fromUrl) {
    const valid = new Set(EVENTS.map((e) => e.id));
    const parsed = fromUrl
      .split(',')
      .map((s) => s.trim())
      .filter((id) => valid.has(id));
    if (parsed.length) return new Set(parsed);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // ignore storage errors
  }
  return new Set();
}

function persistSavedIds(savedIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedIds]));
  } catch {
    // ignore storage errors
  }
}

const state = {
  region: 'All',
  sector: 'All',
  type: 'all', // 'all' | 'endorsed' | 'mission' | 'industry'
  month: null, // 1..12 or null
  query: '',
  onlySaved: false,
  selectedId: 'gulfood-2027',
  savedIds: loadSavedIds(),
  toast: '',
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeBadge(type) {
  if (type === 'endorsed') return { label: 'USDA-Endorsed USA Pavilion', short: 'USDA-Endorsed', cls: 'badge-endorsed' };
  if (type === 'mission') return { label: '2027 USDA Trade Mission', short: 'Trade Mission', cls: 'badge-mission' };
  return { label: 'Major Global Industry Show', short: 'Industry Show', cls: 'badge-industry' };
}

function getFilteredEvents() {
  const q = state.query.trim().toLowerCase();
  return EVENTS.filter((ev) => {
    if (state.region !== 'All' && ev.region !== state.region) return false;
    if (state.sector !== 'All' && !ev.sectors.includes(state.sector)) return false;
    if (state.type !== 'all' && ev.type !== state.type) return false;
    if (state.month !== null && ev.month !== state.month) return false;
    if (state.onlySaved && !state.savedIds.has(ev.id)) return false;
    if (q) {
      const hay = `${ev.name} ${ev.city} ${ev.country} ${ev.venue} ${ev.sectors.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer = null;
function showToast(msg) {
  state.toast = msg;
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
    }, 2600);
  }
}

function renderTimeline(allMatchingExceptMonth) {
  const counts = MONTHS.map((m) => {
    const inMonth = allMatchingExceptMonth.filter((e) => e.month === m.num);
    return {
      ...m,
      total: inMonth.length,
      endorsed: inMonth.filter((e) => e.type === 'endorsed').length,
      industry: inMonth.filter((e) => e.type === 'industry').length,
      milestone: FAS_MILESTONES.find((ms) => ms.month === m.num) || null,
    };
  });
  const maxTotal = Math.max(1, ...counts.map((c) => c.total));

  return `
    <div class="timeline-card">
      <div class="timeline-head">
        <div>
          <p class="eyebrow">2027 Show Density by Month</p>
          <h3>Click any month to filter the map &amp; directory</h3>
        </div>
        ${state.month !== null ? `<button type="button" class="btn-ghost-sm" id="clear-month">Show all 12 months</button>` : ''}
      </div>
      <div class="timeline-bars" role="group" aria-label="2027 monthly event filter">
        ${counts
          .map((c) => {
            const isActive = state.month === c.num;
            const endorsedH = Math.round((c.endorsed / maxTotal) * 56);
            const industryH = Math.round((c.industry / maxTotal) * 56);
            return `
              <button type="button" class="month-col ${isActive ? 'is-active' : ''} ${c.total === 0 ? 'is-empty' : ''}" data-month="${c.num}" aria-pressed="${isActive}">
                <span class="month-count">${c.total || ''}</span>
                <span class="month-bar-wrap">
                  ${industryH > 0 ? `<span class="bar-seg seg-industry" style="height:${industryH}px"></span>` : ''}
                  ${endorsedH > 0 ? `<span class="bar-seg seg-endorsed" style="height:${endorsedH}px"></span>` : ''}
                </span>
                <span class="month-label">${c.short}</span>
                ${c.milestone ? `<span class="month-dot" title="${escapeHtml(c.milestone.label)}"></span>` : '<span class="month-dot-spacer"></span>'}
              </button>
            `;
          })
          .join('')}
      </div>
      <div class="milestones-row">
        <span class="milestones-title">FAS / USAEDC planning windows:</span>
        ${FAS_MILESTONES.map((ms) => `<span class="milestone-chip"><strong>${MONTHS[ms.month - 1].short}</strong> ${escapeHtml(ms.label)}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderDetailCard(filtered) {
  const selected = filtered.find((e) => e.id === state.selectedId) || filtered[0] || null;
  if (!selected) {
    return `
      <aside class="detail-card detail-empty">
        <p class="eyebrow">Selected Event</p>
        <h3>No matching events</h3>
        <p>Try clearing a filter or switching back to All Regions.</p>
        <button type="button" class="btn-secondary" id="reset-filters-card">Reset all filters</button>
      </aside>
    `;
  }

  state.selectedId = selected.id;
  const badge = typeBadge(selected.type);
  const isSaved = state.savedIds.has(selected.id);
  const canIcs = Boolean(selected.startDate && selected.endDate);

  return `
    <aside class="detail-card">
      <div class="detail-top">
        <label class="detail-select-label" for="event-select">Selected Event</label>
        <select id="event-select" class="detail-select" aria-label="Jump to an event">
          ${filtered
            .map(
              (ev) =>
                `<option value="${escapeHtml(ev.id)}" ${ev.id === selected.id ? 'selected' : ''}>${escapeHtml(ev.name)} (${escapeHtml(ev.city)})</option>`
            )
            .join('')}
        </select>
      </div>

      <div class="detail-badges">
        <span class="badge ${badge.cls}">${badge.label}</span>
        <span class="badge badge-region">${escapeHtml(selected.region)}</span>
      </div>

      <h3 class="detail-title">${escapeHtml(selected.name)}</h3>

      <dl class="detail-meta">
        <div>
          <dt>Dates</dt>
          <dd>${escapeHtml(selected.dateLabel)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>${escapeHtml(selected.city)}, ${escapeHtml(selected.country)}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>${escapeHtml(selected.venue)}</dd>
        </div>
      </dl>

      <p class="detail-summary">${escapeHtml(selected.summary)}</p>

      <div class="detail-sectors">
        ${selected.sectors.map((s) => `<span class="sector-pill">${escapeHtml(s)}</span>`).join('')}
      </div>

      <div class="detail-actions">
        <button type="button" class="btn-save ${isSaved ? 'is-saved' : ''}" data-toggle-save="${escapeHtml(selected.id)}">
          ${isSaved ? '★ Saved in My 2027 Schedule' : '☆ Add to My 2027 Schedule'}
        </button>
        <div class="detail-actions-row">
          ${
            canIcs
              ? `<button type="button" class="btn-secondary" data-download-ics="${escapeHtml(selected.id)}">Download .ics</button>`
              : `<span class="tbd-note">Exact 2027 dates pending FAS release</span>`
          }
          <a class="btn-link" href="${escapeHtml(selected.url)}" target="_blank" rel="noopener">Official site ↗</a>
          ${
            selected.fasUrl && selected.fasUrl !== selected.url
              ? `<a class="btn-link" href="${escapeHtml(selected.fasUrl)}" target="_blank" rel="noopener">USDA FAS ↗</a>`
              : ''
          }
        </div>
      </div>
    </aside>
  `;
}

function renderDirectory(filtered) {
  const savedCount = state.savedIds.size;
  const exportEvents = savedCount > 0 ? EVENTS.filter((e) => state.savedIds.has(e.id)) : filtered;
  const exportLabel = savedCount > 0 ? `My Schedule (${savedCount})` : `Filtered (${filtered.length})`;

  return `
    <section class="directory-section">
      <div class="directory-head">
        <div>
          <p class="eyebrow">2027 Event Directory</p>
          <h2>${filtered.length} ${filtered.length === 1 ? 'event' : 'events'} matching your filters</h2>
        </div>
        <div class="export-bar">
          <button type="button" class="btn-primary-sm" id="export-ics-bulk">Export .ics (${exportLabel})</button>
          <button type="button" class="btn-secondary-sm" id="export-csv-bulk">Export CSV</button>
          ${
            savedCount > 0
              ? `<button type="button" class="btn-ghost-sm" id="copy-share-link">Copy Schedule Link</button>`
              : ''
          }
        </div>
      </div>

      ${
        filtered.length === 0
          ? `<div class="empty-state">No events match the current filters. <button type="button" class="link-btn" id="reset-filters-empty">Reset all filters</button></div>`
          : `
        <div class="table-wrap">
          <table class="events-table">
            <thead>
              <tr>
                <th class="col-star" aria-label="Save">★</th>
                <th>Event</th>
                <th>Dates</th>
                <th>Location</th>
                <th>Sectors</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered
                .map((ev) => {
                  const badge = typeBadge(ev.type);
                  const isSaved = state.savedIds.has(ev.id);
                  const isSelected = ev.id === state.selectedId;
                  return `
                    <tr class="${isSelected ? 'is-selected' : ''}" data-row-event="${escapeHtml(ev.id)}">
                      <td class="col-star">
                        <button type="button" class="star-btn ${isSaved ? 'is-saved' : ''}" data-toggle-save="${escapeHtml(ev.id)}" aria-label="${isSaved ? 'Remove from' : 'Add to'} My 2027 Schedule" title="${isSaved ? 'Saved' : 'Save to My 2027 Schedule'}">
                          ${isSaved ? '★' : '☆'}
                        </button>
                      </td>
                      <td>
                        <button type="button" class="row-title-btn" data-select-event="${escapeHtml(ev.id)}">${escapeHtml(ev.name)}</button>
                        <div class="row-sub">
                          <span class="badge-sm ${badge.cls}">${badge.short}</span>
                          <span class="row-venue">${escapeHtml(ev.venue)}</span>
                        </div>
                      </td>
                      <td class="mono-cell">${escapeHtml(ev.dateLabel)}</td>
                      <td>
                        <strong>${escapeHtml(ev.city)}</strong><br />
                        <span class="muted">${escapeHtml(ev.country)}</span>
                      </td>
                      <td>
                        <div class="row-sectors">
                          ${ev.sectors.slice(0, 3).map((s) => `<span class="sector-chip-sm">${escapeHtml(s)}</span>`).join('')}
                        </div>
                      </td>
                      <td class="col-actions">
                        <div class="row-actions">
                          ${
                            ev.startDate
                              ? `<button type="button" class="mini-btn" data-download-ics="${escapeHtml(ev.id)}">.ics</button>`
                              : `<span class="mini-muted">TBD</span>`
                          }
                          <a class="mini-link" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">Site ↗</a>
                        </div>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `
      }
    </section>
  `;
}

function renderApp() {
  const filtered = getFilteredEvents();
  // For timeline bar counts, apply every filter EXCEPT month so user can jump between months
  const prevMonth = state.month;
  state.month = null;
  const matchingAllMonths = getFilteredEvents();
  state.month = prevMonth;

  const endorsedCount = EVENTS.filter((e) => e.type === 'endorsed').length;
  const missionCount = EVENTS.filter((e) => e.type === 'mission').length;
  const countryCount = new Set(EVENTS.map((e) => e.country)).size;

  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="site-header">
      <div class="inner header-bar">
        <div class="header-left">
          <a class="site-name" href="https://duess.com/for-usaedc-members/" target="_blank" rel="noopener">
            <img src="/ds-logo-light.svg" alt="Duess Strategies" class="site-logo" />
          </a>
          <span class="header-tool-tag">events.duess.com</span>
        </div>
        <div class="header-right">
          <a class="header-link" href="https://trade.duess.com/" target="_blank" rel="noopener">Export Scorecard</a>
          <a class="header-link" href="https://ues-checker.duess.com/" target="_blank" rel="noopener">UES Checker</a>
          <a class="header-link" href="https://duess.com/for-usaedc-members/" target="_blank" rel="noopener">USAEDC Members</a>
        </div>
      </div>
    </header>

    <section class="hero">
      <div class="inner hero-inner">
        <div class="hero-copy">
          <p class="eyebrow eyebrow-light">Free tool for USAEDC members &amp; FAS cooperators</p>
          <h1>Global Ag Trade Show Map &amp; <em>2027 Calendar</em></h1>
          <p class="hero-lead">
            Explore USDA-endorsed USA Pavilions, official 2027 FAS Agribusiness Trade Missions, and major global food and ag exhibitions in one place.<br />
            Zero login, instant load, ready for travel budgets and UES planning.
          </p>
        </div>
        <div class="hero-stats">
          <div class="stat-pill"><span class="stat-num">${EVENTS.length}</span><span class="stat-lbl">2027 Events</span></div>
          <div class="stat-pill"><span class="stat-num">${endorsedCount}</span><span class="stat-lbl">USDA Pavilions</span></div>
          <div class="stat-pill"><span class="stat-num">${missionCount}</span><span class="stat-lbl">Trade Missions</span></div>
          <div class="stat-pill"><span class="stat-num">${countryCount}</span><span class="stat-lbl">Countries</span></div>
        </div>
      </div>
    </section>

    <main class="main-wrap">
      <div class="inner">
        <section class="controls-card" aria-label="Filter trade shows">
          <div class="controls-row">
            <div class="region-pills" role="group" aria-label="Filter by region">
              ${REGIONS.map(
                (r) =>
                  `<button type="button" class="pill-btn ${state.region === r.id ? 'is-active' : ''}" data-region="${r.id}">${r.label}</button>`
              ).join('')}
            </div>

            <div class="controls-inputs">
              <select id="sector-filter" class="ctrl-select" aria-label="Filter by commodity sector">
                <option value="All">All Commodity Sectors</option>
                ${SECTORS.map(
                  (s) => `<option value="${escapeHtml(s)}" ${state.sector === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
                ).join('')}
              </select>

              <input
                type="search"
                id="search-input"
                class="ctrl-search"
                placeholder="Search show, city, or country..."
                value="${escapeHtml(state.query)}"
                aria-label="Search shows"
              />
            </div>
          </div>

          <div class="controls-row controls-row-sub">
            <div class="type-pills" role="group" aria-label="Filter by event type">
              <button type="button" class="type-btn ${state.type === 'all' ? 'is-active' : ''}" data-type="all">All Types</button>
              <button type="button" class="type-btn ${state.type === 'endorsed' ? 'is-active' : ''}" data-type="endorsed"><span class="dot dot-endorsed"></span>USDA-Endorsed Pavilions</button>
              <button type="button" class="type-btn ${state.type === 'mission' ? 'is-active' : ''}" data-type="mission"><span class="dot dot-mission"></span>USDA Trade Missions</button>
              <button type="button" class="type-btn ${state.type === 'industry' ? 'is-active' : ''}" data-type="industry"><span class="dot dot-industry"></span>Major Industry Shows</button>
            </div>

            <div class="schedule-toggle-wrap">
              <button type="button" class="schedule-toggle ${state.onlySaved ? 'is-active' : ''}" id="toggle-saved">
                ★ My 2027 Schedule (${state.savedIds.size})
              </button>
              ${
                state.region !== 'All' || state.sector !== 'All' || state.type !== 'all' || state.month !== null || state.query || state.onlySaved
                  ? `<button type="button" class="btn-ghost-sm" id="reset-filters-bar">Reset</button>`
                  : ''
              }
            </div>
          </div>
        </section>

        <section class="workspace-grid">
          <div class="map-card">
            <div class="map-header">
              <div>
                <p class="eyebrow">Interactive World Map</p>
                <span class="map-sub">Hover any pin to preview · Click to inspect · Region pills zoom the map</span>
              </div>
              <div class="map-legend">
                <span><i class="dot dot-endorsed"></i>USDA-Endorsed</span>
                <span><i class="dot dot-industry"></i>Industry</span>
                <span><i class="dot dot-mission"></i>Trade Mission</span>
              </div>
            </div>
            <div class="map-stage" id="map-stage">
              ${renderWorldMapSvg({
                events: filtered,
                selectedId: state.selectedId,
                savedIds: state.savedIds,
                region: state.region,
              })}
              <div class="map-tooltip" id="map-tooltip" role="tooltip" hidden></div>
            </div>
          </div>

          ${renderDetailCard(filtered)}
        </section>

        ${renderTimeline(matchingAllMonths)}
        ${renderDirectory(filtered)}

        <section class="source-note">
          <p>
            <strong>Source &amp; Verification:</strong> Compiled November 2026 from the
            <a href="https://www.fas.usda.gov/topics/trade-shows" target="_blank" rel="noopener">USDA FAS Trade Shows</a>
            and
            <a href="https://www.fas.usda.gov/topics/trade-missions" target="_blank" rel="noopener">USDA FAS Trade Missions</a>
            announcements plus official show organizers. Dates and USA Pavilion registration deadlines can change; always confirm directly with FAS before booking travel.
            Missing a show? Email <a href="mailto:andreas@duess.com">andreas@duess.com</a>.
          </p>
        </section>
      </div>
    </main>

    <footer class="site-footer">
      <div class="inner footer-inner">
        <div class="footer-base">
          <span>&copy; 2026 Duess Strategies Inc.</span>
          <ul class="footer-legal">
            <li><a href="/privacy-policy/">Privacy Policy</a></li>
            <li><a href="/terms/">Terms of Use</a></li>
          </ul>
          <span class="footer-help">Built for USAEDC members &amp; FAS cooperators · <a href="mailto:andreas@duess.com">andreas@duess.com</a></span>
        </div>
      </div>
    </footer>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;

  bindEvents(filtered);
}

function resetFilters() {
  state.region = 'All';
  state.sector = 'All';
  state.type = 'all';
  state.month = null;
  state.query = '';
  state.onlySaved = false;
  renderApp();
}

function toggleSave(id) {
  if (state.savedIds.has(id)) {
    state.savedIds.delete(id);
    showToast('Removed from My 2027 Schedule');
  } else {
    state.savedIds.add(id);
    showToast('Added to My 2027 Schedule');
  }
  persistSavedIds(state.savedIds);
  renderApp();
}

function bindEvents(filtered) {
  // Region pills
  document.querySelectorAll('[data-region]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.region = btn.dataset.region;
      renderApp();
    });
  });

  // Type pills
  document.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      renderApp();
    });
  });

  // Sector select
  document.getElementById('sector-filter')?.addEventListener('change', (e) => {
    state.sector = e.target.value;
    renderApp();
  });

  // Search input (preserve focus & cursor)
  const searchInput = document.getElementById('search-input');
  searchInput?.addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    state.query = e.target.value;
    renderApp();
    const next = document.getElementById('search-input');
    if (next) {
      next.focus();
      next.setSelectionRange(pos, pos);
    }
  });

  // Toggle saved view
  document.getElementById('toggle-saved')?.addEventListener('click', () => {
    state.onlySaved = !state.onlySaved;
    renderApp();
  });

  // Reset buttons
  ['reset-filters-bar', 'reset-filters-card', 'reset-filters-empty'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', resetFilters);
  });

  // Event dropdown in detail card
  document.getElementById('event-select')?.addEventListener('change', (e) => {
    state.selectedId = e.target.value;
    renderApp();
  });

  // Month timeline bars
  document.querySelectorAll('[data-month]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = Number(btn.dataset.month);
      state.month = state.month === m ? null : m;
      renderApp();
    });
  });
  document.getElementById('clear-month')?.addEventListener('click', () => {
    state.month = null;
    renderApp();
  });

  // Save/star buttons
  document.querySelectorAll('[data-toggle-save]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSave(btn.dataset.toggleSave);
    });
  });

  // Row selection
  document.querySelectorAll('[data-select-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedId = btn.dataset.selectEvent;
      renderApp();
      document.querySelector('.workspace-grid')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  // Single .ics downloads
  document.querySelectorAll('[data-download-ics]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = EVENTS.find((x) => x.id === btn.dataset.downloadIcs);
      if (!ev || !ev.startDate) return;
      const ics = generateIcs([ev], ev.name);
      triggerDownload(ics, `${ev.id}.ics`, 'text/calendar;charset=utf-8');
      showToast(`Downloaded ${ev.name}.ics`);
    });
  });

  // Bulk exports
  document.getElementById('export-ics-bulk')?.addEventListener('click', () => {
    const list = state.savedIds.size > 0 ? EVENTS.filter((e) => state.savedIds.has(e.id)) : filtered;
    const dated = list.filter((e) => e.startDate && e.endDate);
    if (!dated.length) {
      showToast('No events with confirmed 2027 dates in selection');
      return;
    }
    const label = state.savedIds.size > 0 ? 'My 2027 Ag Trade Show Schedule' : '2027 Global Ag Trade Shows';
    const ics = generateIcs(dated, label);
    triggerDownload(ics, '2027-ag-trade-shows.ics', 'text/calendar;charset=utf-8');
    showToast(`Exported ${dated.length} events to .ics`);
  });

  document.getElementById('export-csv-bulk')?.addEventListener('click', () => {
    const list = state.savedIds.size > 0 ? EVENTS.filter((e) => state.savedIds.has(e.id)) : filtered;
    const csv = generateCsv(list);
    triggerDownload(csv, '2027-ag-trade-shows.csv', 'text/csv;charset=utf-8');
    showToast(`Exported ${list.length} events to CSV`);
  });

  document.getElementById('copy-share-link')?.addEventListener('click', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('saved', [...state.savedIds].join(','));
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('Shareable schedule link copied to clipboard');
    } catch {
      showToast('Copy failed; check browser clipboard permissions');
    }
  });

  // Map pin click + hover tooltip
  const stage = document.getElementById('map-stage');
  const tooltip = document.getElementById('map-tooltip');
  const eventById = new Map(EVENTS.map((e) => [e.id, e]));

  stage?.querySelectorAll('.map-pin').forEach((pin) => {
    const id = pin.dataset.eventId;
    const ev = eventById.get(id);
    if (!ev) return;

    const showTip = (clientX, clientY) => {
      if (!tooltip || !stage) return;
      const rect = stage.getBoundingClientRect();
      const badge = typeBadge(ev.type);
      tooltip.innerHTML = `
        <div class="tip-title">${escapeHtml(ev.name)}</div>
        <div class="tip-meta">${escapeHtml(ev.city)}, ${escapeHtml(ev.country)} · ${escapeHtml(ev.dateLabel)}</div>
        <div class="tip-type">${badge.short}</div>
      `;
      tooltip.hidden = false;
      const x = Math.min(Math.max(12, clientX - rect.left + 14), rect.width - 230);
      const y = Math.max(12, clientY - rect.top - 58);
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    pin.addEventListener('mouseenter', (e) => showTip(e.clientX, e.clientY));
    pin.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY));
    pin.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.hidden = true;
    });
    pin.addEventListener('click', () => {
      state.selectedId = id;
      renderApp();
    });
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        state.selectedId = id;
        renderApp();
      }
    });
  });
}

renderApp();
