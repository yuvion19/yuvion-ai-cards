import express from "express";
import OpenAI, { toFile } from "openai";
import archiver from "archiver";
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
const requestsByIp = new Map();
const imageRequestsByIp = new Map();
const MAX_IMAGE_BATCHES_PER_WINDOW = 3;

function rateLimit(ip) {
  const now = Date.now();
  const current = requestsByIp.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    requestsByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function imageRateLimit(ip) {
  const now = Date.now();
  const current = imageRequestsByIp.get(ip);
  if (!current || now - current.startedAt > WINDOW_MS) {
    imageRequestsByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_IMAGE_BATCHES_PER_WINDOW;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function decodedImageSize(base64) {
  const cleaned = base64.replace(/\s/g, "");
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
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
    seoTitle: {
      type: "string",
      description: "SEO-заголовок товара на русском языке без неподтвержденных фактов."
    },
    category: {
      type: "string",
      description: "Наиболее вероятная категория или тип товара. Если неясно — обобщенная категория."
    },
    shortDescription: {
      type: "string",
      description: "Краткое описание товара, основанное только на видимых фактах."
    },
    fullDescription: {
      type: "string",
      description: "Продающее, но фактически аккуратное описание на русском языке."
    },
    characteristics: {
      type: "array",
      description: "Только характеристики, которые можно уверенно увидеть или прочитать на фото.",
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
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Релевантные поисковые ключевые слова без выдуманных брендов и характеристик."
    },
    needsClarification: {
      type: "array",
      items: { type: "string" },
      description: "Что продавцу нужно уточнить, потому что это нельзя надежно определить по фото."
    },
    confidence: {
      type: "string",
      enum: ["Высокая", "Средняя", "Низкая"]
    }
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "yuvion-ai-cards",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    if (rateLimit(req.ip || "unknown")) {
      return res.status(429).json({
        error: "Слишком много запросов. Попробуйте немного позже."
      });
    }

    const { image, mimeType } = req.body ?? {};

    if (typeof image !== "string" || typeof mimeType !== "string") {
      return res.status(400).json({ error: "Изображение не передано." });
    }

    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({
        error: "Поддерживаются только JPG, PNG и WebP."
      });
    }

    if (decodedImageSize(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({
        error: "Фотография должна быть не больше 10 МБ."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "AI пока не настроен. Владельцу сервиса нужно добавить OPENAI_API_KEY в Railway."
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const dataUrl = `data:${mimeType};base64,${image}`;

    const response = await client.responses.create({
      model,
      instructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Проанализируй фотографию и подготовь структурированную карточку товара для каталога Yuvion."
            },
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "high"
            }
          ]
        }
      ],
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
    if (!raw) {
      return res.status(502).json({
        error: "AI не вернул результат. Попробуйте другую фотографию."
      });
    }

    let card;
    try {
      card = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        error: "Не удалось разобрать ответ AI. Попробуйте ещё раз."
      });
    }

    return res.json(card);
  } catch (error) {
    console.error("AI analyze error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code
    });

    if (error?.status === 401) {
      return res.status(503).json({
        error: "AI-ключ недействителен. Владельцу сервиса нужно проверить OPENAI_API_KEY."
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        error: "Лимит AI временно исчерпан. Попробуйте позже."
      });
    }
    if (error?.status === 402) {
      return res.status(503).json({
        error: "Для AI требуется пополнить баланс API."
      });
    }

    return res.status(500).json({
      error: "Не удалось создать карточку. Попробуйте ещё раз."
    });
  }
});


const productImagePrompts = [
  "Каталожный hero-кадр: чистый белый или очень светлый фон, мягкая естественная тень, товар по центру, много воздуха, аккуратная предметная съемка.",
  "Премиальный студийный кадр: очень светлый фирменный красно-розовый градиент Yuvion, минималистичная подставка или поверхность, мягкий студийный свет, товар остается главным объектом.",
  "Нейтральный lifestyle-кадр: естественное окружение, логичное только для очевидного типа товара, без людей. Дополнительные предметы могут быть только фоновым декором и не должны выглядеть как часть комплекта.",
  "Премиальный detail-кадр: выразительный студийный свет, чистая минималистичная композиция, товар полностью виден и не обрезан, акцент на фактуре и форме без изменения дизайна."
];

async function generateProductImage(client, sourceBuffer, mimeType, scenePrompt, index) {
  const commonPrompt =
    "Создай профессиональное товарное фото на основе загруженного референса. " +
    "КРИТИЧЕСКИ ВАЖНО: это должен остаться ТОТ ЖЕ товар. Сохрани форму, пропорции, цвет, упаковку, видимые детали, логотипы и существующие надписи настолько точно, насколько возможно. " +
    "Не меняй дизайн товара, не придумывай бренд, надписи, характеристики, детали, комплектность или аксессуары. " +
    "Не показывай невидимую сторону товара как будто она известна. Не добавляй текстовые плашки, цены, водяные знаки или логотипы маркетплейсов. " +
    "Товар должен быть полностью в кадре, без обрезания. Формат вертикальный 3:4. " +
    scenePrompt;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const sourceFile = await toFile(
        sourceBuffer,
        "product-" + index + "." + extensionForMime(mimeType),
        { type: mimeType }
      );

      const result = await client.images.edit({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        image: sourceFile,
        prompt: commonPrompt,
        size: "960x1280",
        quality: "medium",
        output_format: "png",
        moderation: "auto"
      });

      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("Image API returned no image data");
      }
      return Buffer.from(b64, "base64");
    } catch (error) {
      lastError = error;
      if (error?.status === 429 && attempt === 0) {
        await sleep(3500);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

app.post("/api/generate-images", async (req, res) => {
  try {
    if (imageRateLimit(req.ip || "unknown")) {
      return res.status(429).json({
        error: "Лимит генерации изображений: не более 3 ZIP-архивов в час с одного подключения."
      });
    }

    const { image, mimeType, count } = req.body ?? {};
    const imageCount = Number(count);

    if (typeof image !== "string" || typeof mimeType !== "string") {
      return res.status(400).json({ error: "Исходная фотография не передана." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WebP." });
    }
    if (decodedImageSize(image) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Фотография должна быть не больше 10 МБ." });
    }
    if (![3, 4].includes(imageCount)) {
      return res.status(400).json({ error: "Можно сгенерировать только 3 или 4 изображения." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI для изображений пока не настроен." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sourceBuffer = Buffer.from(image, "base64");

    const tasks = productImagePrompts
      .slice(0, imageCount)
      .map((prompt, index) =>
        generateProductImage(client, sourceBuffer, mimeType, prompt, index + 1)
      );

    const generated = await Promise.all(tasks);

    res.status(200);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="yuvion-product-images.zip"'
    );
    res.setHeader("Cache-Control", "no-store");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (error) => {
      console.error("ZIP error:", error);
      res.destroy(error);
    });
    archive.pipe(res);

    generated.forEach((buffer, index) => {
      archive.append(buffer, {
        name: "yuvion_product_" + String(index + 1).padStart(2, "0") + ".png"
      });
    });

    await archive.finalize();
  } catch (error) {
    console.error("Image generation error:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      requestId: error?.request_id
    });

    if (res.headersSent) {
      return res.end();
    }
    if (error?.code === "moderation_blocked") {
      return res.status(400).json({
        error: "Генерация изображения была остановлена проверкой безопасности. Попробуйте другую фотографию."
      });
    }
    if (error?.status === 401) {
      return res.status(503).json({
        error: "AI-ключ недействителен. Нужно проверить OPENAI_API_KEY."
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        error: "Лимит генерации изображений временно исчерпан. Попробуйте позже."
      });
    }
    if (error?.status === 402) {
      return res.status(503).json({
        error: "Для генерации изображений требуется пополнить баланс API."
      });
    }
    if (error?.code === "organization_verification_required" || error?.code === "verification_required") {
      return res.status(503).json({
        error: "Для GPT Image требуется подтверждение организации OpenAI API."
      });
    }

    return res.status(500).json({
      error: "Не удалось сгенерировать изображения. Попробуйте ещё раз."
    });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Yuvion AI Cards listening on port ${port}`);
});
