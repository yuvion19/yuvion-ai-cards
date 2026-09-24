import { mkdir, writeFile } from "node:fs/promises";

const OUT = "qirmizi-master";
const BBOX = "48.493,41.36,48.529,41.3875";
const URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX}`;

function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([:\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function h(tags) {
  let height = Number.parseFloat(String(tags.height || "").replace(",", "."));
  let estimated = false;
  if (!Number.isFinite(height) || height < 1 || height > 120) {
    const levels = Number.parseFloat(tags["building:levels"]);
    height = Number.isFinite(levels) && levels > 0 ? Math.max(3.2, levels * 3.2) : 7.2;
    estimated = true;
  }
  return { height, estimated };
}

const response = await fetch(URL, {
  headers: {
    Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "QirmiziQesebeDigitalTwin/2.0"
  }
});
if (!response.ok) throw new Error(`OSM API ${response.status}`);
const xml = await response.text();

const nodes = new Map();
for (const m of xml.matchAll(/<node\b([^>]*?)\/?>(?:<\/node>)?/g)) {
  const a = attrs(m[1]);
  const id = a.id, lat = Number(a.lat), lon = Number(a.lon);
  if (id && Number.isFinite(lat) && Number.isFinite(lon)) nodes.set(id, [lon, lat]);
}

const buildings = [];
const roads = [];
const places = [];

for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
  const wa = attrs(m[1]);
  const body = m[2];
  const tags = {};
  for (const tm of body.matchAll(/<tag\b([^>]*)\/>/g)) {
    const ta = attrs(tm[1]);
    if (ta.k) tags[ta.k] = ta.v || "";
  }
  const coords = [];
  for (const nm of body.matchAll(/<nd\b([^>]*)\/>/g)) {
    const na = attrs(nm[1]);
    const p = nodes.get(na.ref);
    if (p) coords.push(p);
  }
  if (tags.building && coords.length >= 3) {
    const first = coords[0], last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
    const { height, estimated } = h(tags);
    const id = Number(wa.id);
    buildings.push({
      type: "Feature",
      id,
      properties: {
        osmId: id,
        qqId: `QQ-OSM-${id}`,
        name: tags.name || "",
        nameRu: tags["name:ru"] || "",
        nameAz: tags["name:az"] || "",
        building: tags.building || "building",
        levels: tags["building:levels"] || "",
        height,
        heightEstimated: estimated,
        street: tags["addr:street"] || "",
        houseNumber: tags["addr:housenumber"] || "",
        historic: tags.historic || "",
        tourism: tags.tourism || "",
        religion: tags.religion || "",
        amenity: tags.amenity || "",
        denomination: tags.denomination || ""
      },
      geometry: { type: "Polygon", coordinates: [coords] }
    });
  }
  if (tags.highway && coords.length >= 2) {
    roads.push({
      type: "Feature",
      properties: {
        osmId: Number(wa.id),
        highway: tags.highway,
        name: tags.name || "",
        surface: tags.surface || ""
      },
      geometry: { type: "LineString", coordinates: coords }
    });
  }
}

for (const m of xml.matchAll(/<node\b([^>]*)>([\s\S]*?)<\/node>/g)) {
  const na = attrs(m[1]), body = m[2], tags = {};
  for (const tm of body.matchAll(/<tag\b([^>]*)\/>/g)) {
    const ta = attrs(tm[1]);
    if (ta.k) tags[ta.k] = ta.v || "";
  }
  if (!(tags.name || tags.amenity || tags.tourism || tags.historic)) continue;
  const lon = Number(na.lon), lat = Number(na.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
  places.push({
    type: "Feature",
    properties: {
      osmId: Number(na.id),
      name: tags.name || "",
      amenity: tags.amenity || "",
      tourism: tags.tourism || "",
      historic: tags.historic || "",
      religion: tags.religion || ""
    },
    geometry: { type: "Point", coordinates: [lon, lat] }
  });
}

await mkdir(OUT, { recursive: true });
const payload = {
  version: 2,
  generatedAt: new Date().toISOString(),
  bbox: BBOX.split(",").map(Number),
  buildings: { type: "FeatureCollection", features: buildings },
  roads: { type: "FeatureCollection", features: roads },
  places: { type: "FeatureCollection", features: places }
};
await writeFile(`${OUT}/data.json`, JSON.stringify(payload));
console.log(`Qirmizi snapshot: ${buildings.length} buildings, ${roads.length} roads, ${places.length} places`);
