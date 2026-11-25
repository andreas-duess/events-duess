import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';

const WIDTH = 960;
const HEIGHT = 480;

// Regional zoom viewBoxes in [x, y, w, h] coordinates for the 960x480 Natural Earth map
export const REGION_VIEWBOX = {
  All: '0 10 960 455',
  Europe: '410 45 200 135',
  'Asia-Pacific': '590 95 335 315',
  'Middle East & Africa': '430 140 270 250',
  Americas: '85 50 325 355',
};

const projection = geoNaturalEarth1()
  .scale(178)
  .translate([WIDTH / 2, HEIGHT / 2 + 22]);

const pathGenerator = geoPath(projection);

// Precompute country GeoJSON features once (excluding Antarctica id "010")
const countriesGeo = feature(worldAtlas, worldAtlas.objects.countries).features.filter(
  (f) => String(f.id) !== '010'
);

const landPathsHtml = countriesGeo
  .map((f) => {
    const d = pathGenerator(f);
    return d ? `<path class="map-country" d="${d}" />` : '';
  })
  .join('');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Spread pins that share identical or nearly identical coordinates
 * into a tiny, neat radial ring so every event is individually clickable.
 */
function layoutPins(events, region) {
  const isZoomed = region && region !== 'All';
  const spreadRadius = isZoomed ? 4.8 : 9.5;

  const projected = events
    .map((ev) => {
      const pt = projection([ev.lon, ev.lat]);
      if (!pt) return null;
      return { ev, x: pt[0], y: pt[1] };
    })
    .filter(Boolean);

  // Group by rounded coordinate bucket
  const buckets = new Map();
  for (const item of projected) {
    const key = `${Math.round(item.x / 4)}_${Math.round(item.y / 4)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const out = [];
  for (const group of buckets.values()) {
    if (group.length === 1) {
      out.push({ ...group[0], dx: group[0].x, dy: group[0].y });
    } else {
      group.forEach((item, idx) => {
        const angle = (2 * Math.PI * idx) / group.length - Math.PI / 2;
        out.push({
          ...item,
          dx: item.x + Math.cos(angle) * spreadRadius,
          dy: item.y + Math.sin(angle) * spreadRadius,
        });
      });
    }
  }
  return out;
}

export function renderWorldMapSvg({ events, selectedId, savedIds, region = 'All' }) {
  const viewBox = REGION_VIEWBOX[region] || REGION_VIEWBOX.All;
  const isZoomed = region !== 'All';
  const pinR = isZoomed ? 4.4 : 6.4;
  const activeR = isZoomed ? 7.6 : 11.2;
  const strokeW = isZoomed ? 1.1 : 1.7;

  const pins = layoutPins(events, region);

  // Sort so selected pin renders on top
  pins.sort((a, b) => {
    if (a.ev.id === selectedId) return 1;
    if (b.ev.id === selectedId) return -1;
    return 0;
  });

  const pinsHtml = pins
    .map(({ ev, dx, dy }) => {
      const isSelected = ev.id === selectedId;
      const isSaved = savedIds.has(ev.id);
      const cls = [
        'map-pin',
        `pin-${ev.type}`,
        isSelected ? 'is-selected' : '',
        isSaved ? 'is-saved' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <g class="${cls}" data-event-id="${escapeHtml(ev.id)}" transform="translate(${dx.toFixed(2)}, ${dy.toFixed(2)})" tabindex="0" role="button" aria-label="${escapeHtml(ev.name)} (${escapeHtml(ev.city)}, ${escapeHtml(ev.dateLabel)})">
          ${isSelected ? `<circle class="pin-halo" r="${activeR}" />` : ''}
          <circle class="pin-hit" r="${pinR + 4.5}" fill="transparent" />
          <circle class="pin-dot" r="${isSelected ? pinR * 1.22 : pinR}" stroke-width="${strokeW}" />
          ${isSaved ? `<circle class="pin-star-dot" cx="${(pinR * 0.72).toFixed(2)}" cy="${(-pinR * 0.72).toFixed(2)}" r="${isZoomed ? 2.1 : 2.9}" />` : ''}
        </g>
      `;
    })
    .join('');

  return `
    <svg class="world-map-svg" viewBox="${viewBox}" role="img" aria-label="Interactive world map of 2027 agricultural trade shows and USDA trade missions" preserveAspectRatio="xMidYMid meet">
      <rect class="map-ocean" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" />
      <g class="map-land">${landPathsHtml}</g>
      <g class="map-pins">${pinsHtml}</g>
    </svg>
  `;
}
