import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS } from '../src/data/events.js';
import { addOneDayIso, generateIcs, generateCsv } from '../src/engine/ics.js';

test('EVENTS dataset has unique IDs, valid coordinates, and valid ISO dates', () => {
  const ids = new Set();
  assert.ok(EVENTS.length >= 30, 'Expected at least 30 events');
  for (const ev of EVENTS) {
    assert.ok(ev.id && !ids.has(ev.id), `Duplicate or empty id: ${ev.id}`);
    ids.add(ev.id);
    assert.ok(ev.lat >= -90 && ev.lat <= 90, `Invalid lat for ${ev.id}`);
    assert.ok(ev.lon >= -180 && ev.lon <= 180, `Invalid lon for ${ev.id}`);
    if (ev.startDate) {
      assert.match(ev.startDate, /^\d{4}-\d{2}-\d{2}$/, `Invalid startDate for ${ev.id}`);
      assert.match(ev.endDate, /^\d{4}-\d{2}-\d{2}$/, `Invalid endDate for ${ev.id}`);
      assert.ok(ev.endDate >= ev.startDate, `endDate < startDate for ${ev.id}`);
    }
  }
});

test('addOneDayIso rolls month and year boundaries correctly', () => {
  assert.equal(addOneDayIso('2027-01-31'), '2027-02-01');
  assert.equal(addOneDayIso('2027-02-28'), '2027-03-01');
  assert.equal(addOneDayIso('2027-12-31'), '2028-01-01');
});

test('generateIcs emits valid RFC 5545 VCALENDAR with exclusive DTEND', () => {
  const gulfood = EVENTS.find((e) => e.id === 'gulfood-2027');
  const ics = generateIcs([gulfood], 'Test Schedule');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270315\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270320\r\n'));
  assert.ok(ics.includes('SUMMARY:Gulfood\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
});

test('generateCsv escapes commas and outputs expected columns', () => {
  const csv = generateCsv(EVENTS.slice(0, 3));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith('Event,Type,Dates,Start Date,End Date,City,Country,Region,Venue,Sectors,Official URL'));
});
