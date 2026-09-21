import express from "express";
import OpenAI, { toFile } from "openai";
import archiver from "archiver";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  etag: true
}));

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_CARD_BATCHES_PER_WINDOW = 3;
const requestsByIp = new Map();
const cardRequestsByIp = new Map();

function limitMap(map, ip, max) {
  const now = Date.now();
  const current = map.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    map.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > max;
}

function rollbackLimit(map, ip) {
  const current = map.get(ip);
  if (!current) return;
  current.count = Math.max(0, current.count - 1);
}

function decodedImageSize(base64) {
  const cleaned = base64.replace(/\s/g, "");
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compact(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function wrapWords(value, maxChars = 28, maxLines = 3) {
  const words = compact(value, 500).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length <= maxChars || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(" ").length;
  const original = words.join(" ");
  if (used < original.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:!?]?$/, "") + "…";
  }
  return lines;
}

function textLines(lines, { x, y, size, lineHeight, weight = 600, fill = "#1D1B1C", anchor = "start" }) {
  const safe = lines.map(escapeXml);
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${safe.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`).join("")}</text>`;
}

function bulletGroups(items, { x, y, maxChars = 25, maxItems = 5, size = 30, lineHeight = 40, gap = 24 }) {
  let cursorY = y;
  let out = "";
  const list = items.filter(Boolean).slice(0, maxItems);
  for (const item of list) {
    const lines = wrapWords(item, maxChars, 2);
    out += `<circle cx="${x}" cy="${cursorY - 9}" r="8" fill="#F03E4A"/>`;
    out += textLines(lines, { x: x + 28, y: cursorY, size, lineHeight, weight: 650, fill: "#33282A" });
    cursorY += lines.length * lineHeight + gap;
  }
  return out;
}

const productCardSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "seoTitle",
    "category",
    "shortDescription",
    "fullDescription",
    "characteristics",
    "keywords",
    "needsClarification",
    "confidence"
  ],
  properties: {
    seoTitle: { type: "string" },
    category: { type: "string" },
    shortDescription: { type: "string" },
    fullDescription: { type: "string" },
    characteristics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value"],
        properties: {
          name: { type: "string" },
          value: { type: "string" }
        }
      }
    },
    keywords: { type: "array", items: { type: "string" } },
    needsClarification: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["Высокая", "Средняя", "Низкая"] }
  }
};

const instructions = `
Ты создаешь карточки товаров для каталога Yuvion по ОДНОЙ фотографии товара.

Главное правило: НЕ ВЫДУМЫВАЙ данные.
Нельзя утверждать размеры, вес, материал, состав, мощность, емкость, бренд, модель, страну производства, комплектность, сертификацию, цветовой код, возрастное назначение и любые другие параметры, если они не читаются на фотографии или не определяются визуально с высокой уверенностью.

Если параметр нельзя достоверно определить по фото, не добавляй его в characteristics. Вместо этого добавь понятный пункт в needsClarification.
Если сам тип товара неясен, выбери максимально общую категорию и укажи низкую уверенность.
Не упоминай Ozon, Wildberries или другие маркетплейсы.
Пиши на русском языке, в деловом e-commerce стиле.
SEO-заголовок должен быть естественным, без спама, капслока и неподтвержденных брендов.
Полное описание должно продавать через видимые свойства и сценарии использования, но не придумывать технические факты.
`;

const marketingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["benefits", "usage"],
  properties: {
    benefits: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" }
    },
    usage: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    }
  }
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "yuvion-ai-cards",
    version: "3.0.0",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    if (limitMap(requestsByIp, req.ip || "unknown", MAX_REQUESTS_PER_WINDOW)) {
      return res.status(429).json({ error: "Слишком много запросов. Попробуйте немного позже." });
    }

    const { image, mimeType } = req.body ?? {};
    if (typeof image !== "string" || typeof mimeType !== "string") {
      return res.status(400).json({ error: "Изображение не передано." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    }
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI пока не настроен." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const dataUrl = `data:${mimeType};base64,${image}`;

    const response = await client.responses.create({
      model,
      instructions,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Проанализируй фотографию и подготовь структурированную карточку товара для каталога Yuvion." },
          { type: "input_image", image_url: dataUrl, detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "yuvion_product_card",
          strict: true,
          schema: productCardSchema
        }
      },
      max_output_tokens: 2200
    });

    const raw = response.output_text;
    if (!raw) return res.status(502).json({ error: "AI не вернул результат." });

    try {
      return res.json(JSON.parse(raw));
    } catch {
      return res.status(502).json({ error: "Не удалось разобрать ответ AI." });
    }
  } catch (error) {
    console.error("AI analyze error:", { message: error?.message, status: error?.status, code: error?.code });
    if (error?.status === 401) return res.status(503).json({ error: "AI-ключ недействителен." });
    if (error?.status === 429) return res.status(429).json({ error: "Лимит AI временно исчерпан." });
    if (error?.status === 402) return res.status(503).json({ error: "Для AI требуется пополнить баланс API." });
    return res.status(500).json({ error: "Не удалось создать карточку. Попробуйте ещё раз." });
  }
});

async function makeMarketingCopy(client, card) {
  const fallbackBenefits = (card.characteristics || [])
    .slice(0, 5)
    .map((item) => `${compact(item.name, 36)}: ${compact(item.value, 52)}`);

  const fallbackUsage = [
    compact(card.shortDescription || card.category || "Подходит для повседневного использования", 90),
    "Подробности и неподтвержденные параметры уточняйте у продавца"
  ];

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions:
        "Сделай короткие продающие подписи для инфографики товара. Используй ТОЛЬКО факты из переданного JSON. " +
        "Не придумывай размеры, материалы, бренд, модель, мощность, комплектность или другие параметры. " +
        "Не превращай неизвестные данные в преимущества. Каждый пункт — короткая фраза до 55 символов. " +
        "В usage допускаются только очевидные сценарии использования, которые прямо следуют из категории и описания.",
      input: JSON.stringify(card),
      text: {
        format: {
          type: "json_schema",
          name: "yuvion_marketing_copy",
          strict: true,
          schema: marketingSchema
        }
      },
      max_output_tokens: 700
    });

    const parsed = JSON.parse(response.output_text || "{}");
    return {
      benefits: Array.isArray(parsed.benefits) && parsed.benefits.length ? parsed.benefits : fallbackBenefits,
      usage: Array.isArray(parsed.usage) && parsed.usage.length ? parsed.usage : fallbackUsage
    };
  } catch (error) {
    console.warn("Marketing copy fallback:", error?.message);
    return {
      benefits: fallbackBenefits.length ? fallbackBenefits : [compact(card.category || "Товар", 55), compact(card.shortDescription || "Описание по фото", 55), "Подробности уточняйте у продавца"],
      usage: fallbackUsage
    };
  }
}

const cardScenes = [
  "Каталожная предметная съемка. Товар полностью виден, расположен в верхних двух третях кадра. В нижней трети оставь много чистого светлого пространства для будущего текста. Белый или очень светлый фон, мягкая естественная тень.",
  "Премиальная студийная съемка. Товар расположен преимущественно справа, слева оставлено чистое свободное пространство. Очень светлый красно-розовый фирменный градиент, мягкий студийный свет, без текста.",
  "Чистая студийная композиция. Товар расположен в верхней половине, нижняя половина спокойная и свободная для инфографики. Светлый нейтральный фон, аккуратная предметная съемка.",
  "Нейтральная lifestyle-сцена без людей. Окружение допустимо только если оно очевидно соответствует типу товара. Товар полностью виден, в нижней части оставлено свободное пространство. Никаких аксессуаров, которые могут выглядеть как часть комплекта."
];

async function generateScene(client, sourceBuffer, mimeType, scenePrompt, index) {
  const prompt =
    "Создай профессиональное товарное изображение по загруженному референсу. " +
    "КРИТИЧЕСКИ ВАЖНО: это должен остаться ТОТ ЖЕ товар. Сохрани форму, пропорции, цвет, упаковку, видимые детали, логотипы и существующие надписи настолько точно, насколько возможно. " +
    "Не меняй дизайн товара, не придумывай бренд, текст, технические характеристики, дополнительные детали, комплектность или аксессуары. " +
    "Не добавляй текстовые плашки, цены, водяные знаки, логотипы маркетплейсов или новые надписи на товар. " +
    "Товар не обрезать. Оставляй заметный безопасный отступ от краев. " +
    scenePrompt;

  const candidateModels = [
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    "gpt-image-1"
  ].filter((value, index, array) => array.indexOf(value) === index);

  let lastError;
  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const sourceFile = await toFile(
          sourceBuffer,
          "product-" + index + "." + extensionForMime(mimeType),
          { type: mimeType }
        );

        const result = await client.images.edit({
          model,
          image: sourceFile,
          prompt,
          size: "1024x1536",
          quality: "medium",
          output_format: "png",
          moderation: "auto"
        });

        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new Error("Image API returned no image data");
        return Buffer.from(b64, "base64");
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        if (error?.status === 429 && attempt === 0) {
          await sleep(3500);
          continue;
        }
        if ((error?.status === 404 || error?.status === 400) && /model|not found|does not exist/i.test(message)) {
          break;
        }
        throw error;
      }
    }
  }
  throw lastError;
}

function overlayForCard(index, card, copy) {
  const title = compact(card.seoTitle || card.category || "Товар", 120);
  const category = compact(card.category || "Товар", 50);
  const characteristics = Array.isArray(card.characteristics) ? card.characteristics : [];

  if (index === 0) {
    const titleLines = wrapWords(title, 26, 3);
    const quick = characteristics.slice(0, 3).map((item) => `${compact(item.name, 22)}: ${compact(item.value, 34)}`);
    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="46" y="48" rx="22" ry="22" width="192" height="54" fill="#F03E4A"/>
        <text x="142" y="84" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">YUVION</text>
        <rect x="38" y="805" rx="34" ry="34" width="824" height="350" fill="#FFFFFF" fill-opacity="0.96"/>
        <text x="78" y="860" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="#D62F3B">${escapeXml(category.toUpperCase())}</text>
        ${textLines(titleLines, { x: 78, y: 920, size: 46, lineHeight: 56, weight: 800, fill: "#1D1B1C" })}
        ${quick.length ? bulletGroups(quick, { x: 88, y: 1080, maxChars: 36, maxItems: 3, size: 22, lineHeight: 28, gap: 8 }) : ""}
      </svg>`;
  }

  if (index === 1) {
    const benefits = (copy.benefits || []).slice(0, 5);
    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="30" y="70" rx="34" ry="34" width="490" height="1050" fill="#FFFFFF" fill-opacity="0.95"/>
        <text x="74" y="145" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="800" fill="#F03E4A">YUVION</text>
        <text x="74" y="220" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="850" fill="#1D1B1C">Преимущества</text>
        ${bulletGroups(benefits, { x: 86, y: 320, maxChars: 24, maxItems: 5, size: 31, lineHeight: 42, gap: 30 })}
      </svg>`;
  }

  if (index === 2) {
    const specs = characteristics.slice(0, 6);
    let y = 790;
    let rows = "";
    if (specs.length) {
      for (const item of specs) {
        rows += `
          <text x="78" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="#8B6A70">${escapeXml(compact(item.name, 30))}</text>
          <text x="78" y="${y + 38}" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="750" fill="#1D1B1C">${escapeXml(compact(item.value, 43))}</text>
        `;
        y += 72;
      }
    } else {
      rows = textLines(["Подробные характеристики", "уточняйте у продавца"], { x: 78, y: 820, size: 34, lineHeight: 46, weight: 700, fill: "#1D1B1C" });
    }

    return `
      <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="1200" fill="none"/>
        <rect x="38" y="650" rx="34" ry="34" width="824" height="510" fill="#FFFFFF" fill-opacity="0.96"/>
        <text x="78" y="720" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="#F03E4A">YUVION</text>
        <text x="78" y="770" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="850" fill="#1D1B1C">Характеристики</text>
        ${rows}
      </svg>`;
  }

  const usage = (copy.usage || []).slice(0, 4);
  const desc = wrapWords(card.shortDescription || card.fullDescription || category, 42, 3);
  return `
    <svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="1200" fill="none"/>
      <rect x="38" y="690" rx="34" ry="34" width="824" height="470" fill="#FFFFFF" fill-opacity="0.96"/>
      <text x="78" y="750" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="800" fill="#F03E4A">YUVION</text>
      <text x="78" y="805" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="850" fill="#1D1B1C">Для чего подойдет</text>
      ${bulletGroups(usage, { x: 88, y: 880, maxChars: 42, maxItems: 3, size: 28, lineHeight: 36, gap: 16 })}
      ${textLines(desc, { x: 78, y: 1080, size: 20, lineHeight: 28, weight: 500, fill: "#776B6E" })}
    </svg>`;
}

async function composeCard(sceneBuffer, overlaySvg) {
  const base = await sharp(sceneBuffer)
    .resize(900, 1200, {
      fit: "contain",
      background: { r: 252, g: 248, b: 248, alpha: 1 }
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return sharp(base)
    .composite([{ input: Buffer.from(overlaySvg) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function zipBuffers(entries) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const entry of entries) archive.append(entry.buffer, { name: entry.name });
    archive.finalize();
  });
}

app.post("/api/generate-cards", async (req, res) => {
  try {
    if (limitMap(cardRequestsByIp, req.ip || "unknown", MAX_CARD_BATCHES_PER_WINDOW)) {
      return res.status(429).json({ error: "Лимит: не более 3 комплектов карточек в час с одного подключения." });
    }

    const { image, mimeType, card } = req.body ?? {};
    if (typeof image !== "string" || typeof mimeType !== "string" || !card || typeof card !== "object") {
      return res.status(400).json({ error: "Не хватает исходного фото или данных товара." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    }
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI для изображений пока не настроен." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sourceBuffer = Buffer.from(image, "base64");
    const marketingCopy = await makeMarketingCopy(client, card);

    const scenes = [];
    for (let start = 0; start < 4; start += 2) {
      const pair = await Promise.all(
        cardScenes.slice(start, start + 2).map((prompt, localIndex) =>
          generateScene(client, sourceBuffer, mimeType, prompt, start + localIndex + 1)
        )
      );
      scenes.push(...pair);
    }

    const fileNames = [
      "01_cover.png",
      "02_benefits.png",
      "03_specs.png",
      "04_usage.png"
    ];
    const titles = ["Обложка", "Преимущества", "Характеристики", "Применение"];

    const cards = [];
    for (let index = 0; index < 4; index += 1) {
      const overlay = overlayForCard(index, card, marketingCopy);
      const buffer = await composeCard(scenes[index], overlay);
      cards.push({
        name: fileNames[index],
        title: titles[index],
        buffer
      });
    }

    const zipBuffer = await zipBuffers(cards.map((item) => ({ name: item.name, buffer: item.buffer })));

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      cards: cards.map((item) => ({
        filename: item.name,
        title: item.title,
        base64: item.buffer.toString("base64")
      })),
      zipBase64: zipBuffer.toString("base64"),
      zipName: "yuvion-product-cards.zip",
      format: "900x1200"
    });
  } catch (error) {
    console.error("Card generation error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      requestId: error?.request_id
    });

    if (error?.code === "moderation_blocked") {
      return res.status(400).json({ error: "Генерация изображения остановлена проверкой безопасности. Попробуйте другую фотографию." });
    }
    if (error?.status === 401) return res.status(503).json({ error: "AI-ключ недействителен." });
    if (error?.code === "credit_balance_exhausted") {
      rollbackLimit(cardRequestsByIp, req.ip || "unknown");
      return res.status(402).json({
        error: "На балансе OpenAI API закончились кредиты. Пополните API-баланс и повторите генерацию."
      });
    }
    if (error?.status === 429) {
      rollbackLimit(cardRequestsByIp, req.ip || "unknown");
      return res.status(429).json({ error: "Достигнут лимит запросов OpenAI API. Попробуйте немного позже." });
    }
    if (error?.status === 402) return res.status(503).json({ error: "Для генерации изображений требуется пополнить баланс API." });
    if (error?.code === "organization_verification_required" || error?.code === "verification_required") {
      return res.status(503).json({ error: "Для генерации изображений требуется подтверждение организации OpenAI API." });
    }
    return res.status(500).json({ error: "Не удалось создать 4 карточки. Попробуйте ещё раз." });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Yuvion AI Cards v3 listening on port ${port}`);
});
