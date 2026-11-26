#!/usr/bin/env node
/**
 * Monthly health check for events.duess.com:
 * - Lists events with TBD dates (e.g., 2027 USDA Trade Missions, FHC Shanghai)
 * - Lists events whose endDate has passed
 * - Checks official show URLs (HEAD/GET with timeout) for broken 404/410 links
 * Outputs a concise Markdown report (written to events-audit.md if --out is given).
 */

import fs from 'node:fs/promises';
import { EVENTS } from '../src/data/events.js';

const today = new Date().toISOString().slice(0, 10);
const tbd = EVENTS.filter((e) => !e.startDate || !e.endDate);
const past = EVENTS.filter((e) => e.endDate && e.endDate < today);
const upcoming = EVENTS.filter((e) => e.endDate && e.endDate >= today);

const brokenLinks = [];
const uniqueUrls = [...new Set(EVENTS.map((e) => e.url).filter(Boolean))];

for (const url of uniqueUrls) {
  if (url.includes('fas.usda.gov')) continue; // FAS blocks automated HTTP requests (403)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'events-duess-link-check/1.0 (+https://events.duess.com)' },
    });
    clearTimeout(timer);
    if (res.status === 404 || res.status === 410) {
      brokenLinks.push({ url, status: res.status });
    }
  } catch {
    // Ignore transient network/WAF timeouts
  }
}

const lines = [
  `## Monthly Trade Show Schedule Audit (${today})`,
  '',
  `- **Total events:** ${EVENTS.length}`,
  `- **Upcoming dated events:** ${upcoming.length}`,
  `- **Past events:** ${past.length}`,
  `- **TBD dates pending confirmation:** ${tbd.length}`,
  `- **Broken organizer links (404/410):** ${brokenLinks.length}`,
  '',
  '### Events Pending Confirmed 2027 Dates',
  ...tbd.map((e) => `- [ ] **${e.name}** (${e.city}, ${e.country}) — ${e.dateLabel}`),
  '',
];

if (brokenLinks.length) {
  lines.push('### Broken Organizer URLs');
  for (const b of brokenLinks) {
    lines.push(`- [ ] \`${b.status}\` ${b.url}`);
  }
  lines.push('');
}

lines.push(
  '### Official Sources to Review',
  '- [USDA FAS Trade Shows](https://www.fas.usda.gov/topics/trade-shows)',
  '- [USDA FAS Agribusiness Trade Missions](https://www.fas.usda.gov/topics/trade-missions)',
  '',
  'Edit `src/data/events.js` on `main` to update dates — pushing to `main` automatically runs tests and deploys to https://events.duess.com/.'
);

const report = lines.join('\n') + '\n';
const outIdx = process.argv.indexOf('--out');
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  await fs.writeFile(process.argv[outIdx + 1], report, 'utf8');
}
console.log(report);
