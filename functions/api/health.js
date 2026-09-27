export async function onRequestGet({ env }) {
  return Response.json({
    ok: true,
    service: "UVMALL Telegram Mini App",
    platform: "cloudflare-pages-functions",
    channel: env.TELEGRAM_CHANNEL_ID || "@uvmall",
    botConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
    autopostSecretConfigured: Boolean(env.UVMALL_AUTOPOST_SECRET),
    timestamp: new Date().toISOString()
  }, { headers: { "cache-control": "no-store" } });
}