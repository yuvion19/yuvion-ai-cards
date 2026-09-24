import { writeFile } from "node:fs/promises";

const bbox = "41.36,48.493,41.3875,48.529";
const query = `[out:json][timeout:25];way["building"](${bbox});out tags geom;`;
const mirrors = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function normalize(osm) {
  const features = [];
  for (const e of osm.elements || []) {
    if (e.type !== "way" || !e.geometry || e.geometry.length < 3) continue;
    const t = e.tags || {};
    let height = Number.parseFloat(String(t.height || "").replace(",", "."));
    let estimated = false;
    if (!Number.isFinite(height) || height < 1 || height > 100) {
      const levels = Number.parseFloat(t["building:levels"]);
      height = Number.isFinite(levels) && levels > 0 ? Math.max(3.2, levels * 3.2) : 7.2;
      estimated = true;
    }
    const ring = e.geometry.map((p) => [p.lon, p.lat]);
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    features.push({
      type: "Feature",
      properties: {
        id: e.id,
        qq: `QQ-OSM-${e.id}`,
        name: t.name || "",
        street: t["addr:street"] || "",
        num: t["addr:housenumber"] || "",
        building: t.building || "building",
        levels: t["building:levels"] || "",
        height,
        estimated,
        historic: t.historic || "",
        religion: t.religion || "",
        tourism: t.tourism || "",
        amenity: t.amenity || ""
      },
      geometry: { type: "Polygon", coordinates: [ring] }
    });
  }
  return { type: "FeatureCollection", generatedAt: new Date().toISOString(), features };
}

async function fetchMirror(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    return normalize(await response.json());
  } finally {
    clearTimeout(timer);
  }
}


function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([:\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

async function fetchOsmApiSnapshot() {
  const response = await fetch("https://api.openstreetmap.org/api/0.6/map?bbox=48.493,41.36,48.529,41.3875", {
    headers: { "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8", "User-Agent": "QirmiziQesebeDigitalTwin/1.0" }
  });
  if (!response.ok) throw new Error(`OSM API ${response.status}`);
  const xml = await response.text();
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>(?:<\/node>)?/g)) {
    const a = attrs(m[1]);
    const id = a.id, lat = Number(a.lat), lon = Number(a.lon);
    if (id && Number.isFinite(lat) && Number.isFinite(lon)) nodes.set(id, [lon, lat]);
  }
  const features = [];
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const wa = attrs(m[1]);
    const body = m[2];
    const tags = {};
    for (const tm of body.matchAll(/<tag\b([^>]*)\/>/g)) {
      const ta = attrs(tm[1]);
      if (ta.k) tags[ta.k] = ta.v || "";
    }
    if (!tags.building) continue;
    const ring = [];
    for (const nm of body.matchAll(/<nd\b([^>]*)\/>/g)) {
      const na = attrs(nm[1]);
      const pt = nodes.get(na.ref);
      if (pt) ring.push(pt);
    }
    if (ring.length < 3) continue;
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    let height = Number.parseFloat(String(tags.height || "").replace(",", "."));
    let estimated = false;
    if (!Number.isFinite(height) || height < 1 || height > 100) {
      const levels = Number.parseFloat(tags["building:levels"]);
      height = Number.isFinite(levels) && levels > 0 ? Math.max(3.2, levels * 3.2) : 7.2;
      estimated = true;
    }
    const id = Number(wa.id);
    features.push({
      type: "Feature",
      properties: {
        id,
        qq: `QQ-OSM-${id}`,
        name: tags.name || "",
        street: tags["addr:street"] || "",
        num: tags["addr:housenumber"] || "",
        building: tags.building || "building",
        levels: tags["building:levels"] || "",
        height,
        estimated,
        historic: tags.historic || "",
        religion: tags.religion || "",
        tourism: tags.tourism || "",
        amenity: tags.amenity || ""
      },
      geometry: { type: "Polygon", coordinates: [ring] }
    });
  }
  if (!features.length) throw new Error("OSM API returned no buildings");
  return { type: "FeatureCollection", generatedAt: new Date().toISOString(), features };
}

async function fetchFlootSnapshot() {
  const response = await fetch("https://qirmizi-qesebe-3d.floot.app/_api/osm-buildings", {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Floot snapshot ${response.status}`);
  const body = await response.json();
  const payload = body?.json ?? body;
  if (!payload?.features?.length) throw new Error("Floot snapshot empty");
  return payload;
}

let snapshot;
try {
  snapshot = await fetchFlootSnapshot();
  console.log(`Floot snapshot: ${snapshot.features.length} buildings`);
} catch (flootError) {
  console.warn("Floot snapshot unavailable:", flootError?.message || flootError);
  try {
    snapshot = await Promise.any(mirrors.map(fetchMirror));
    if (!snapshot.features.length) throw new Error("Empty Overpass snapshot");
    console.log(`Overpass snapshot: ${snapshot.features.length} buildings`);
  } catch (overpassError) {
    console.warn("Overpass snapshot unavailable:", overpassError?.message || overpassError);
    try {
      snapshot = await fetchOsmApiSnapshot();
      console.log(`OSM API snapshot: ${snapshot.features.length} buildings`);
    } catch (osmApiError) {
      console.warn("All snapshot sources unavailable:", osmApiError?.message || osmApiError);
      snapshot = { type: "FeatureCollection", generatedAt: new Date().toISOString(), features: [] };
    }
  }
}

await writeFile("qirmizi-live/buildings.json", JSON.stringify(snapshot));
