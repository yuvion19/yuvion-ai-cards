# Juhuri Translate — GigaChat Gateway

Private server-side gateway for https://juhuritranslate.pusk.io. Only the backend obtains GigaChat OAuth tokens; never place any GigaChat keys in PUSK's published HTML or browser JavaScript.

## Endpoints
- GET /health: checks whether an authorization key is configured; no secrets returned.
- POST /v1/translate: JSON {"text":"...","from":"ru","to":"juh","references":[{"ru":"...","jdt":"...","source":"Google SMOL"}]}

Only the Juhuri Translate site and its owner preview are allowed browser origins. Client and server both label AI translations as unverified. The service refuses unsupported Juhuri translations without reference examples; no silent substitutions. Source/reference text is sent to Sber only when a site visitor explicitly clicks an AI action.

## Render configuration
Runtime Node >=20, build command `echo ready`, start `node juhuri-gigachat-gateway/server.mjs`. Free plan works for trial requests, subject to provider limits.

Set **on the Render service only**:
- `GIGACHAT_AUTH_KEY`: GigaChat API Authorization key from Sber Studio (**required**; never post it to chat/GitHub).
- `GIGACHAT_SCOPE`: `GIGACHAT_API_PERS` for personal API or `GIGACHAT_API_B2B` / `GIGACHAT_API_CORP` as licensed.
- `GIGACHAT_MODEL`: `GigaChat` or another model actually available under the account.
- `GIGACHAT_OAUTH_URL`: defaults to Sber's documented `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`.
- `IP_DAILY_LIMIT`: default 12, cap 50. `GLOBAL_DAILY_LIMIT`: default 100, cap 300.

GigaChat requires a trusted certificate chain including the relevant Russian CA; install/verify the required CA bundle in server infrastructure, e.g. using `NODE_EXTRA_CA_CERTS`, rather than disabling TLS verification. Current server uses native fetch and keeps TLS checking enabled.

This server uses in-memory rate limits, which reset after process restarts; for a paid or high-volume production API, add durable quotas, anti-abuse controls, a consent/privacy notice, and monitoring. CORS alone is not authentication.

## Activation
1. Deploy this service.
2. Configure `GIGACHAT_AUTH_KEY` in Render's secret environment settings and verify GET /health returns ready:true.
3. Test one real translation end-to-end with verified sample pairs before enabling broad public traffic.
4. Do not claim that GigaChat is specially trained on Juhuri or that generated results are verified by speakers.

Official documentation: https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api
