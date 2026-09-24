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

let snapshot;
try {
  snapshot = await Promise.any(mirrors.map(fetchMirror));
  if (!snapshot.features.length) throw new Error("Empty snapshot");
  console.log(`OSM snapshot: ${snapshot.features.length} buildings`);
} catch (error) {
  console.warn("OSM snapshot unavailable during build:", error?.message || error);
  snapshot = { type: "FeatureCollection", generatedAt: new Date().toISOString(), features: [] };
}

await writeFile("qirmizi-live/buildings.json", JSON.stringify(snapshot));
