(() => {
  "use strict";

  const STORE_KEY = "qirmizi-master-store-v2";
  const LEGACY_KEY = "qirmizi-master-store-v1";
  const DB_NAME = "qirmizi-media-v1";

  function defaults() {
    return {
      version: 2,
      records: {},
      streets: {},
      materials: {},
      routes: [],
      contributions: [],
      roles: [],
      stories: [],
      juhuriItems: [],
      audit: [],
      settings: { lang: "ru" },
      updatedAt: new Date().toISOString()
    };
  }

  function load() {
    let obj = null;
    try { obj = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch {}
    if (!obj) {
      try { obj = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch {}
    }
    const s = Object.assign(defaults(), obj || {});
    s.records ||= {};
    s.streets ||= {};
    s.materials ||= {};
    s.routes ||= [];
    s.contributions ||= [];
    s.roles ||= [];
    s.stories ||= [];
    s.juhuriItems ||= [];
    s.audit ||= [];
    return s;
  }

  function save(s, action = "update", target = "project") {
    s.updatedAt = new Date().toISOString();
    s.audit = [
      ...(s.audit || []),
      { id: "AUD-" + crypto.randomUUID(), at: s.updatedAt, action, target }
    ].slice(-5000);
    const json = JSON.stringify(s);
    localStorage.setItem(STORE_KEY, json);
    try {
      localStorage.setItem("qirmizi-auto-backup-v2", json);
      localStorage.setItem("qirmizi-auto-backup-at", s.updatedAt);
    } catch {}
    return s;
  }

  function materialId() {
    return "MAT-" + crypto.randomUUID();
  }

  async function sha256(file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function imageDHash(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = 9;
          cv.height = 8;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 9, 8);
          const d = ctx.getImageData(0, 0, 9, 8).data;
          const bits = [];
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
              const i = (y * 9 + x) * 4;
              const j = i + 4;
              const g1 = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
              const g2 = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
              bits.push(g1 > g2 ? 1 : 0);
            }
          }
          let hex = "";
          for (let i = 0; i < 64; i += 4) {
            hex += parseInt(bits.slice(i, i + 4).join(""), 2).toString(16);
          }
          URL.revokeObjectURL(url);
          resolve(hex);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image decode failed"));
      };
      img.src = url;
    });
  }

  function hammingHex(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let n = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) {
        n += x & 1;
        x >>= 1;
      }
    }
    return n;
  }

  async function readExif(file) {
    const out = {};
    if (!/jpe?g/i.test(file.type || file.name || "")) return out;

    const buf = await file.arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;

    let p = 2;
    while (p + 4 < v.byteLength) {
      if (v.getUint8(p) !== 0xff) {
        p++;
        continue;
      }

      const marker = v.getUint8(p + 1);
      const len = v.getUint16(p + 2);
      if (!len || p + 2 + len > v.byteLength) break;

      if (marker === 0xe1 && p + 10 < v.byteLength) {
        const sig = String.fromCharCode(...new Uint8Array(buf, p + 4, 6));
        if (sig === "Exif\0\0") {
          try {
            const base = p + 10;
            const little = v.getUint16(base) === 0x4949;
            const u16 = (off) => v.getUint16(base + off, little);
            const u32 = (off) => v.getUint32(base + off, little);
            const rational = (off) => {
              const den = u32(off + 4);
              return den ? u32(off) / den : 0;
            };

            if (u16(2) !== 42) return out;

            const findEntry = (ifdOffset, tag) => {
              if (!ifdOffset || base + ifdOffset + 2 > v.byteLength) return null;
              const count = u16(ifdOffset);
              for (let i = 0; i < count; i++) {
                const e = ifdOffset + 2 + i * 12;
                if (base + e + 12 > v.byteLength) break;
                if (u16(e) === tag) return e;
              }
              return null;
            };

            const valueLong = (entry) => entry ? u32(entry + 8) : 0;
            const valueAscii = (entry) => {
              if (!entry) return "";
              const count = u32(entry + 4);
              const dataOffset = count <= 4 ? entry + 8 : u32(entry + 8);
              let s = "";
              for (let i = 0; i < count; i++) {
                const abs = base + dataOffset + i;
                if (abs >= v.byteLength) break;
                const ch = v.getUint8(abs);
                if (!ch) break;
                s += String.fromCharCode(ch);
              }
              return s;
            };
            const readRationals = (entry) => {
              if (!entry) return null;
              const count = u32(entry + 4);
              const offset = u32(entry + 8);
              const arr = [];
              for (let i = 0; i < count; i++) arr.push(rational(offset + i * 8));
              return arr;
            };

            const ifd0 = u32(4);
            const gpsOffset = valueLong(findEntry(ifd0, 0x8825));
            const exifOffset = valueLong(findEntry(ifd0, 0x8769));

            if (gpsOffset) {
              const latRef = valueAscii(findEntry(gpsOffset, 1));
              const lonRef = valueAscii(findEntry(gpsOffset, 3));
              const latParts = readRationals(findEntry(gpsOffset, 2));
              const lonParts = readRationals(findEntry(gpsOffset, 4));

              if (latParts?.length >= 3 && lonParts?.length >= 3) {
                let lat = latParts[0] + latParts[1] / 60 + latParts[2] / 3600;
                let lon = lonParts[0] + lonParts[1] / 60 + lonParts[2] / 3600;
                if (latRef === "S") lat = -lat;
                if (lonRef === "W") lon = -lon;
                out.latitude = lat;
                out.longitude = lon;
              }

              const dirEntry = findEntry(gpsOffset, 17);
              if (dirEntry) {
                const dirOffset = u32(dirEntry + 8);
                out.direction = rational(dirOffset);
              }
            }

            if (exifOffset) {
              const dateEntry = findEntry(exifOffset, 0x9003);
              if (dateEntry) out.dateTimeOriginal = valueAscii(dateEntry);
            }

            return out;
          } catch {
            return out;
          }
        }
      }

      p += 2 + len;
    }
    return out;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
        if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(storeName, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const r = db.transaction(storeName).objectStore(storeName).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function dbAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const r = db.transaction(storeName).objectStore(storeName).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  async function dbDelete(storeName, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function safeUrl(u) {
    try {
      const x = new URL(u, location.href);
      return ["http:", "https:", "data:", "blob:"].includes(x.protocol) ? x.href : "";
    } catch {
      return "";
    }
  }

  function download(name, text, type = "application/json") {
    const a = document.createElement("a");
    const b = new Blob([text], { type });
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
  }

  function center(f) {
    const ring = f?.geometry?.coordinates?.[0] || [];
    if (!ring.length) return [48.5106, 41.3736];
    const p = ring.length > 1 ? ring.slice(0, -1) : ring;
    const s = p.reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
    return [s[0] / p.length, s[1] / p.length];
  }

  function dist(a, b) {
    const R = 6371000;
    const p1 = a[1] * Math.PI / 180;
    const p2 = b[1] * Math.PI / 180;
    const dp = (b[1] - a[1]) * Math.PI / 180;
    const dl = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function label(f, s) {
    const p = f?.properties || {};
    const r = s.records?.[p.qqId];
    return r?.title || p.nameRu || p.name || [p.street, p.houseNumber].filter(Boolean).join(" ") || p.qqId || "Объект";
  }

  function issues(f, s) {
    const p = f.properties || {};
    const r = s.records?.[p.qqId];
    const a = [];
    if (!p.street && !p.houseNumber) a.push("Нет адреса OSM");
    if (p.heightEstimated) a.push("Высота оценочная");
    if (!r?.media?.some((m) => m.type === "photo")) a.push("Нужна фотография");
    if (!r?.year) a.push("Не установлен период");
    if (r && !r.sources?.length) a.push("Нужен источник");
    if (r?.issues?.length) a.push(...r.issues.map((x) => x.text || "Проверить запись"));
    return a;
  }

  function completeness(f, s) {
    const r = s.records?.[f.properties.qqId];
    if (!r) return 0;
    let n = 0;
    if (r.description) n += 15;
    if (r.year) n += 10;
    if (r.sources?.length) n += 20;
    if (r.media?.some((m) => m.type === "photo")) n += 20;
    if (r.media?.some((m) => m.type === "video")) n += 5;
    if (r.panoramaUrl) n += 10;
    if (r.modelUrl) n += 10;
    if (r.audioUrl) n += 5;
    if (r.verification === "verified") n += 5;
    return Math.min(100, n);
  }

  function buildStreetIndex(data, s) {
    const streets = {};
    for (const f of data?.buildings?.features || []) {
      const name = f.properties.street || "Без улицы";
      (streets[name] ??= []).push(f.properties.qqId);
    }
    for (const [name, ids] of Object.entries(streets)) {
      s.streets[name] = {
        ...(s.streets[name] || {}),
        name,
        houseIds: ids,
        updatedAt: new Date().toISOString()
      };
    }
    return s;
  }

  function kml(data, s) {
    const pm = (x) => Number(x).toFixed(7);
    const placemarks = (data?.buildings?.features || []).map((f) => {
      const c = center(f);
      const r = s.records?.[f.properties.qqId];
      return `<Placemark><name>${esc(label(f, s))}</name><description><![CDATA[${esc(r?.description || "")}]]></description><ExtendedData><Data name="qqId"><value>${esc(f.properties.qqId)}</value></Data><Data name="progress"><value>${completeness(f, s)}</value></Data></ExtendedData><Point><coordinates>${pm(c[0])},${pm(c[1])},0</coordinates></Point></Placemark>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Qirmizi Qesebe</name>${placemarks}</Document></kml>`;
  }

  function iiifManifest(house, data, s) {
    const f = (data?.buildings?.features || []).find((x) => x.properties.qqId === house);
    const r = s.records?.[house];
    if (!f) return null;
    const imgs = (r?.media || []).filter((m) => m.type === "photo" && /^https?:/.test(m.url || ""));
    return {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: location.origin + location.pathname.replace(/[^/]+$/, "") + "iiif/" + encodeURIComponent(house) + ".json",
      type: "Manifest",
      label: { ru: [label(f, s)] },
      metadata: [
        { label: { ru: ["QQ-ID"] }, value: { none: [house] } },
        {
          label: { ru: ["Источник"] },
          value: { ru: [(r?.sources || []).map((x) => x.label || x.url).filter(Boolean).join("; ") || "Не указан"] }
        }
      ],
      items: imgs.map((m, i) => ({
        id: `urn:qq:${house}:canvas:${i + 1}`,
        type: "Canvas",
        height: 1000,
        width: 1500,
        items: [{
          id: `urn:qq:${house}:page:${i + 1}`,
          type: "AnnotationPage",
          items: [{
            id: `urn:qq:${house}:annotation:${i + 1}`,
            type: "Annotation",
            motivation: "painting",
            body: { id: m.url, type: "Image", format: "image/jpeg" },
            target: `urn:qq:${house}:canvas:${i + 1}`
          }]
        }]
      }))
    };
  }

  window.QQCore = {
    STORE_KEY, DB_NAME, load, save, materialId, sha256, imageDHash, hammingHex,
    readExif, dbPut, dbGet, dbAll, dbDelete, esc, safeUrl, download, center, dist,
    label, issues, completeness, buildStreetIndex, kml, iiifManifest
  };
})();