// RFC 5545 .ics calendar & CSV export helpers for events.duess.com

function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsDate(isoDate) {
  return String(isoDate).replace(/-/g, '');
}

/**
 * RFC 5545 all-day DTEND is exclusive, so add 1 calendar day to endDate.
 */
export function addOneDayIso(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function generateIcs(events, calendarName = '2027 Global Ag Trade Shows') {
  const dated = events.filter((e) => e.startDate && e.endDate);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Duess Strategies//events.duess.com//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const ev of dated) {
    const typeLabel =
      ev.type === 'endorsed'
        ? 'USDA-Endorsed Trade Show (USA Pavilion)'
        : ev.type === 'mission'
          ? 'USDA FAS Agribusiness Trade Mission'
          : 'Major Global Industry Trade Show';
    const descParts = [
      typeLabel,
      ev.summary,
      ev.sectors?.length ? `Sectors: ${ev.sectors.join(', ')}` : '',
      ev.url ? `Official site: ${ev.url}` : '',
      'Source: https://events.duess.com/',
    ].filter(Boolean);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@events.duess.com`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(ev.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addOneDayIso(ev.endDate))}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.name)}`);
    lines.push(`LOCATION:${escapeIcsText(`${ev.venue}, ${ev.city}, ${ev.country}`)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
    if (ev.url) lines.push(`URL:${ev.url}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function csvCell(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateCsv(events) {
  const headers = [
    'Event',
    'Type',
    'Dates',
    'Start Date',
    'End Date',
    'City',
    'Country',
    'Region',
    'Venue',
    'Sectors',
    'Official URL',
  ];
  const rows = [headers.map(csvCell).join(',')];
  for (const ev of events) {
    const typeLabel =
      ev.type === 'endorsed'
        ? 'USDA-Endorsed Pavilion'
        : ev.type === 'mission'
          ? 'USDA Trade Mission'
          : 'Major Industry Show';
    rows.push(
      [
        ev.name,
        typeLabel,
        ev.dateLabel,
        ev.startDate || '',
        ev.endDate || '',
        ev.city,
        ev.country,
        ev.region,
        ev.venue,
        (ev.sectors || []).join('; '),
        ev.url || '',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return rows.join('\r\n') + '\r\n';
}
