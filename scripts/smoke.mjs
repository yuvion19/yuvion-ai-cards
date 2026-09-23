import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const server=fs.readFileSync('server.js','utf8');
const dockerfile=fs.readFileSync('Dockerfile','utf8');
const worker=fs.readFileSync('public/local-vision-worker.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

const fail=(message)=>{console.error('SMOKE FAIL:',message);process.exitCode=1};
const ok=(message)=>console.log('SMOKE OK:',message);

const start=html.lastIndexOf('<script>');
const end=html.lastIndexOf('</script>');
if(start<0||end<0)fail('inline app script not found');
else{
  try{new Function(html.slice(start+8,end));ok('inline app JavaScript parses')}
  catch(e){fail('inline app JavaScript syntax: '+e.message)}
}

const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
if(duplicates.length)fail('duplicate DOM ids: '+duplicates.join(', '));else ok('DOM ids unique');

const openDetails=(html.match(/<details\b/g)||[]).length;
const closeDetails=(html.match(/<\/details>/g)||[]).length;
if(openDetails!==closeDetails)fail('details tags unbalanced '+openDetails+'/'+closeDetails);else ok('details tags balanced');

const required=[
  'excelAutopilot','publishCenter','confirmationCenter','operationsV64',
  'queueBudgetUsd','storageManager','labelOcrBox','networkPill',
  'productUrlInput','importProductUrl','urlImportStatus','sourceReference','renderMode','autoCards','designStudio','designPalette','productScale','productShiftX','productShiftY','designIntensity','designSubstyle','beautifyDesign','coverVariants','coverLab','coverVariantGrid','liveCover','marketPreview','saveDesignSnapshot','designHistoryList','coverTitleInput','showBrandToggle','showTitleToggle','showPriceToggle','seasonSelect','layoutAudit','safeZoneToggle','darkWorkbenchToggle','wideWorkbenchToggle','referencePaletteFile','profileIntensity','profileSubstyle','profileSeason','profileSeriesDesign'
];
const missing=required.filter(id=>!ids.includes(id));
if(missing.length)fail('required v6.5 UI ids missing: '+missing.join(', '));else ok('required v6.5 UI present');

const features=[
  ['/api/render-card-overlays','scene overlay rerender'],
  ['/api/label-ocr','label OCR'],
  ['analysisFingerprintForItem','AI cache'],
  ['previewMappedImportDiff','Excel diff'],
  ['restoreLastImportSnapshot','Excel rollback'],
  ['fetchJsonRetry','safe retry'],
  ['Yuvion Helper 3.0','Helper 3.0'],
  ['/api/import-url','public product URL import'],
  ['validatePublicHttpUrl','URL SSRF validation'],
  ['isBlockedIp','private IP protection'],
  ['Сайт-источник','URL provenance marker'],
  ['hydrateExcelItemFromUrl','Excel URL hydration'],
  ["key:'sourceUrl'",'Excel URL column mapping'],
  ['urlImportPending','resumable URL import state'],
  ['safeRasterTypes','remote SVG rejection'],
  ['embeddedPublicJson','modern storefront embedded JSON fallback'],
  ['renderFreeScene','free local image renderer'],
  ['makeProductReflection','local product reflection'],
  ['studioLocalV6: true','Studio Local v6 health metadata'],
  ['proceduralStudioLighting: true','procedural studio lighting metadata'],
  ['depthOfFieldBackdrop: true','depth of field backdrop metadata'],
  ['acrylicStageSets: true','acrylic stage set metadata'],
  ['zeroImageApiMode: true','zero image API mode metadata'],
  ['imageAiDisabledByProduct: true','paid image AI disabled metadata'],
  ['const mode = "free";','free rendering default'],
  ['freeSceneRenders','free render telemetry'],
  ['MAX_FREE_CARD_BATCHES_PER_WINDOW','separate free batch limit'],
  ['freeCardRequestsByIp','free render limiter separated from AI limiter'],
  ['freeImageAiCalls: 0','health confirms zero image-AI calls for free mode'],
  ['Создать 4 карточки бесплатно','free mode is explicit in UI'],
  ['autoCreateCardsIfEnabled','automatic four-card workflow'],
  ['recommendedStyleForProduct','category-aware style recommendation'],
  ['darkUniformBackground','free uniform-background cutout'],
  ['sellerNeutralCopy','seller-neutral commercial copy'],
  ['Игрушки и детские товары','kids selling-card theme'],
  ['extractProductPalette','adaptive product palette'],
  ['normalizeComposition','manual composition controls'],
  ['designEngine','design engine health metadata'],
  ['Красота и уход','beauty category theme'],
  ['Спорт и активность','sport category theme'],
  ['Инструменты и ремонт','tools category theme'],
  ['Еда и напитки','food category theme'],
  ['designStyleGrid','visual style gallery'],
  ['extractPaletteFromDataUrl','client palette preview'],
  ['currentDesignVariant','layout variants'],
  ['syncCompositionFromControls','visual composition editor'],
  ['/api/cover-variants','free cover A/B endpoint'],
  ['normalizeDesignIntensity','three design intensity levels'],
  ['normalizeDesignSubstyle','design substyles'],
  ['smartPlacement: true','smart product placement'],
  ['designIntensityLevels: 3','design intensity health metadata'],
  ['freeCoverAB: true','free A/B cover health metadata'],
  ['loadCoverVariants','cover variants UI'],
  ['recommendedDesignPersonality','category design personality'],
  ['beautifyDesign','one-click beautify action'],
  ['renderLiveDesignPreview','live design preview'],
  ['renderMarketplacePreview','marketplace-scale preview'],
  ['captureDesignSnapshot','design history snapshots'],
  ['designSnapshots:currentDesignSnapshots','persisted design history'],
  ['livePreview: true','live preview health metadata'],
  ['marketplacePreview: true','marketplace preview health metadata'],
  ['designHistory: true','design history health metadata'],
  ['normalizeVisualOptions','visual block options'],
  ['visualBlockEditor: true','visual editor health metadata'],
  ['seasonalDecor: true','seasonal decor health metadata'],
  ['safeZoneChecks: true','safe zone health metadata'],
  ['dynamicTypography: true','dynamic typography health metadata'],
  ['confirmedPriceOverlay: true','confirmed price overlay metadata'],
  ['renderLayoutAudit','layout overload audit'],
  ['SERIES_PRESET_KEY','series design preset'],
  ['WORKBENCH_THEME_KEY','dark workbench preference'],
  ['referencePaletteFile','reference palette input'],
  ['analyzeReferenceDesign','reference design balance'],
  ['profileSeriesDesign','series design profile'],
  ['localSeriesPresets: true','series presets health metadata'],
  ['referenceDesignBalance: true','reference balance health metadata'],
  ['darkWorkbench: true','dark workbench health metadata'],
  ['wideWorkbench: true','wide workbench health metadata'],
  ['benefitIconLibrary: true','benefit icon library metadata'],
  ['textlessCoverMode: true','textless cover health metadata'],
  ['benefitIconKind','benefit icon selector'],
  ['iconBenefitGroups','icon benefit layout'],
  ['showTitleToggle','textless cover UI'],
  ['createImmediateFreeCards','immediate free card generation'],
  ['setTimeout(()=>controller.abort(),75000)','client analysis timeout budget'],
  ['hadImmediateCards','preserve cards during analysis'],
  ['AI_ANALYZE_TIMEOUT_MS','server analysis timeout'],
  ['analyzeTimeoutSeconds','health analysis timeout metadata'],
  ['analysisRetries','analysis retry path'],
  ['reasoning: { effort: "none" }','fast analysis reasoning'],
  ['OPENAI_FAST_MODEL','fast analysis retry model'],
  ['currentCards.length!==4||cardsStale','stale immediate cards refresh'],
  ['smartBackgroundCutout','smart light-background cutout'],
  ['enhanceProductSource','adaptive source photo enhancement'],
  ['makeProductShadow','adaptive product shadow'],
  ['normalizeRenderAdditionalImages','multi-photo render input'],
  ['renderSelections = [0,1,2,3]','card-specific source routing'],
  ['powerLocalRenderer: true','power renderer health metadata'],
  ['multiPhotoScenes: true','multi-photo health metadata'],
  ['additionalPhotosForRender','client render-photo payload'],
  ['duplicatePhotoId','exact duplicate-photo guard'],
  ['Комплект прошёл QA','QA readiness gate'],
  ['Быстрый бесплатный QA','immediate free-card QA'],
  ['.simple-ui #designStudio{display:none!important}','simple mode hides professional design studio'],
  ['Профессиональный режим','professional UI mode naming'],
  ['autopilotQa: true','autopilot QA health metadata'],
  ['duplicatePhotoGuard: true','duplicate photo health metadata'],
  ['simpleProfessionalModes: true','simple/professional health metadata'],
  ['batchFactoryV2: true','Batch Factory v2 health metadata'],
  ['batchQaV3: true','Batch Factory QA v3 metadata'],
  ['batchQaHardGate: true','batch QA hard export gate metadata'],
  ['excelQaQuarantine: true','Excel QA quarantine metadata'],
  ['repairBatchCardsToQa','shared batch QA repair loop'],
  ['batchQaPassed','strict batch QA pass predicate'],
  ['autoQueueContinuation: true','automatic Excel queue continuation metadata'],
  ['persistedBatchQA: true','persisted batch QA metadata'],
  ['provenanceExport: true','provenance export metadata'],
  ['const EXCEL_AUTOPILOT_LIMIT=25','larger Excel autopilot chunks'],
  ['Продолжаем автоматически','automatic Excel queue chaining'],
  ['const repaired=await repairBatchCardsToQa','batch QA v3 persistence pipeline'],
  ['duplicatePhotoInCatalog(item,allItems)','duplicate photo catalog guard'],
  ['QA пройден','catalog QA report column'],
  ['3 серии','full design series selector UI'],
  ['Серии дизайна','series lab UI'],
  ['full-set-on-select','series selection server mode'],
  ['designEngineV5: true','Design Engine v5 health metadata'],
  ['fullSeriesChooser: true','full series chooser health metadata'],
  ['autoSeriesRegeneration: true','series auto-regeneration metadata'],
  ['markCardsStale([0,1,2,3])','series forces full-card refresh'],
  ['Studio Director v11','current renderer UI marker'],
  ['localCardVisualMetrics','local visual QA metrics'],
  ['visualQaVersion: 5','local QA v5 response'],
  ['localVisualQaV2: true','local visual QA v2 health metadata'],
  ['localVisualQaV3: true','local visual QA v3 health metadata'],
  ['seriesDiversityQa: true','series perceptual diversity QA metadata'],
  ['deterministicQualityScore: true','deterministic image quality score metadata'],
  ['localSeriesSimilarity','series similarity implementation'],
  ['perceptualSignatureSimilarity','perceptual signature comparison'],
  ['entropyAndContrastChecks: true','entropy and contrast QA metadata'],
  ['smartPhotoCleanupV2: true','Smart Photo Cleanup v2 metadata'],
  ['adaptiveToneMapping: true','adaptive tone mapping metadata'],
  ['safeCutoutPadding: true','safe cutout padding metadata'],
  ['twoStageEdgeFeathering: true','two-stage edge feathering metadata'],
  ['productIntakeV2: true','Product Intake v2 health metadata'],
  ['urlImportProvenanceAudit: true','URL provenance audit metadata'],
  ['urlImportEmbeddedJsonFallback: true','embedded JSON URL import fallback metadata'],
  ['guaranteedDescriptions: true','guaranteed description metadata'],
  ['gptProductCopyEnabled:','GPT product copy health flag'],
  ['gptProductCopyConfigured: ["openai","groq","cloudflare","openrouter"].some(copyProviderConfigured)','multi-provider copy configured flag'],
  ['gptProductCopyModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna"','GPT copy model metadata'],
  ['gptProductCopyFallback: true','GPT copy local fallback metadata'],
  ['/api/generate-copy','GPT copy endpoint'],
  ['function generateProductCopyWithGpt','GPT copy generator'],
  ['function generateProductCopyWithProviders','multi-provider copy router'],
  ['["openai", callOpenAiCopy]','OpenAI first copy provider'],
  ['["groq", callGroqCopy]','Groq second copy provider'],
  ['["cloudflare", callCloudflareCopy]','Cloudflare third copy provider'],
  ['["openrouter", callOpenRouterCopy]','OpenRouter fourth copy provider'],
  ['"https://api.groq.com/openai/v1"','Groq OpenAI-compatible endpoint'],
  ['"openai/gpt-oss-120b"','Groq GPT-OSS 120B default'],
  ['"https://api.cloudflare.com/client/v4/accounts/"','Cloudflare Workers AI endpoint'],
  ['"@cf/openai/gpt-oss-120b"','Cloudflare GPT-OSS 120B default'],
  ['"https://openrouter.ai/api/v1"','OpenRouter endpoint'],
  ['"openrouter/free"','OpenRouter free router default'],
  ['copyProviderCircuitBreaker: true','copy provider circuit breaker metadata'],
  ['copyProviderPriority: ["openai","groq","cloudflare","openrouter","vireonix","local"]','copy provider priority metadata'],
  ['function setCopyProviderCooldown','provider cooldown implementation'],
  ['credit_balance_exhausted','provider credit exhaustion failover'],
  ['noLoginAiFallback: true','no-login AI fallback metadata'],
  ['["vireonix", callVireonixCopy]','Vireonix no-auth provider in fallback chain'],
  ['https://vireonix.ai/v1/chat/completions','Vireonix no-auth endpoint'],
  ['async function callVireonixCopy','Vireonix caller implementation'],
  ['name === "vireonix"','Vireonix configured without API key'],
  ['vireonix: { configured: copyProviderConfigured("vireonix")','Vireonix health provider metadata'],
  ['auth: "none"','Vireonix no-auth health marker'],

  ["data.provider||copy.copyProvider","frontend preserves actual server provider"],


  ['store: false','OpenAI copy storage disabled'],
  ['name: "yuvion_product_copy"','GPT structured output schema'],
  ['copyProvider: provider','dynamic copy provider marker'],
  ['async function enhanceProductCopyWithGpt','frontend GPT copy helper'],
  ['function ensureVisibleProductDescription','client visible-description guard'],
  ['d=ensureVisibleProductDescription(d);','editor description guarantee'],
  ["currentData?.shortDescription||currentData?.fullDescription","compact result full-description fallback"],
  ['return ensureVisibleProductDescription({','persisted edit description guarantee'],
  ['currentData=ensureVisibleProductDescription(currentData);','URL pre-GPT description guarantee'],
  ['analyzed=ensureVisibleProductDescription(analyzed);','Excel description guarantee'],
  ["creativeStatus.textContent='GPT готовит описание товара по подтверждённым данным…'","photo flow GPT copy integration"],
  ["setUrlImportStatus('Данные получены. GPT готовит описание товара…'","URL flow GPT copy integration"],
  ['analyzed=await enhanceProductCopyWithGpt(analyzed);','Excel flow GPT copy integration'],
  ['function productSeedFromEmbeddedJson','embedded product parser'],
  ['function mergeProductSeeds','URL seed merge'],
  ['function safeCatalogDescription','safe description fallback helper'],
  ['descriptionFallbackUsed: Boolean(urlDescription.generated)','URL description fallback audit'],
  ['embeddedProductDataUsed: Boolean(embeddedSeed)','embedded product audit'],
  ['shortDescription: sellerNeutralCopy(ai?.shortDescription || seed.description || "", 500) || urlDescription.short','URL short description guarantee'],
  ['fullDescription: sellerNeutralCopy(ai?.fullDescription || seed.description || "", ai?.fullDescription ? 3000 : 1800) || urlDescription.full','URL full description guarantee'],
  ['sourceFieldEvidence: true','source field evidence metadata'],
  ['const {response,data:payload}=await fetchJsonRetry(\'/api/import-url\'','URL import wrapper destructuring'],
  ['Не предоставлено источником','source audit missing-field UI'],
  ['Подтверждено полей источником','catalog provenance report column'],
  ['id="cameraFile"','mobile camera input'],
  ['capture="environment"','rear camera capture hint'],
  ['id="takeProductPhoto"','take photo action'],
  ['id="chooseProductPhoto"','gallery action'],
  ['mobileCaptureFlow: true','mobile capture flow health metadata'],
  ['cameraGallerySplit: true','camera/gallery split metadata'],
  ['verifySvgTextRendering','SVG text runtime self-test'],
  ['fontRenderingReady','font rendering health flag'],
  ['svgTextSelfTest: true','SVG text self-test health metadata'],
  ['textOverlayHealthGate: true','text overlay health gate metadata'],
  ['textOverlayPixelGuard: true','per-card text overlay pixel guard metadata'],
  ['textOverlayStartupSelfTest: true','text overlay startup self-test metadata'],
  ['verifyTextOverlayPixelGuard','text overlay startup self-test implementation'],
  ['textOverlayGuardReady','text overlay health readiness field'],
  ['rasterizeOverlayWithTextGuard','rasterized text-layer verification'],
  ['textOverlayChecks','text overlay runtime counters'],
  ['CARD_RENDER_SCHEMA=4','card render cache schema'],
  ['legacyCardCacheMigration: true','legacy card cache migration metadata'],
  ['automaticTextOverlayRepair: true','automatic text overlay repair metadata'],
  ['Старый комплект создан до исправления текстовых оверлеев','old-card auto repair UI'],
  ['subject-touches-frame','safe fallback when subject touches source edge'],
  ['firstRing','two-stage alpha feather implementation']
];
for(const [needle,label] of features){
  if(!(html.includes(needle)||server.includes(needle)))fail(label+' missing');else ok(label);
}
if(html.includes('js.puter.com')||html.includes('window.puter')||html.includes('enhanceProductCopyWithPuter'))fail('Puter login fallback still present');else ok('Puter login fallback removed');


const urlSecurity=[
  'MAX_REMOTE_HTML_BYTES','MAX_REMOTE_IMAGE_BYTES','REMOTE_FETCH_TIMEOUT_MS',
  'localhost','169 && b === 254','192 && b === 168','redirect: "manual"','safeRasterTypes'
];
const missingUrlSecurity=urlSecurity.filter(needle=>!server.includes(needle));
if(missingUrlSecurity.length)fail('URL import security guard missing: '+missingUrlSecurity.join(', '));else ok('URL import security guards present');

const oldDomain='yuvioncards.online';
if(html.includes(oldDomain)||server.includes(oldDomain))fail('retired domain is referenced');else ok('retired domain absent');

const lines=html.split('\n');
const fetchWindows=[];
lines.forEach((line,i)=>{if(line.includes('fetch('))fetchWindows.push(lines.slice(Math.max(0,i-4),Math.min(lines.length,i+14)).join('\n'))});
const privateTerms=['privateNotes','privateCost','privateStock','privateLocation','privateCollections','storeRulesText'];
const leaks=privateTerms.filter(term=>fetchWindows.some(w=>w.includes(term)));
if(leaks.length)fail('private fields near network payloads: '+leaks.join(', '));else ok('privacy network invariant');

const healthVersion=(server.match(/version:\s*"([^"]+)"/)||[])[1];
if(healthVersion!==pkg.version)fail('package/server version mismatch: '+pkg.version+' vs '+healthVersion);else ok('package/server version '+pkg.version);

if(process.exitCode)process.exit(process.exitCode);

if(server.includes('уточняйте у продавца'))fail('seller mention leaked into image overlay');else ok('seller mention absent from image overlay');
if(!server.includes('version: "'+pkg.version+'"'))fail('server health version does not match package version');else ok('server health version '+pkg.version);
if(server.includes('primaryRole: selectedSource.role'))fail('batch renderer references undefined selectedSource');else ok('batch renderer response variables safe');
if(!server.includes('renderEngine: "studio-local-v6"'))fail('studio-local-v6 renderer marker missing');else ok('studio-local-v6 renderer marker present');
if(!server.includes('categoryAwareLayouts: true'))fail('category-aware layout metadata missing');else ok('category-aware layout metadata present');
if(!server.includes('marketplaceEditorialOverlays: true'))fail('editorial overlay metadata missing');else ok('editorial overlay metadata present');
if(!server.includes('fourDistinctCompositions: true'))fail('four distinct compositions metadata missing');else ok('four distinct compositions metadata present');
if(!server.includes('designArchetype'))fail('design archetype routing missing');else ok('design archetype routing present');
if(!server.includes('makeProductHalo'))fail('product halo enhancement missing');else ok('product halo enhancement present');

if(!dockerfile.includes('fonts-dejavu-core'))fail('Dockerfile must install DejaVu fonts');else ok('Dockerfile installs DejaVu fonts');
if(!dockerfile.includes('fontconfig'))fail('Dockerfile must install fontconfig');else ok('Dockerfile installs fontconfig');
if(!dockerfile.includes('RUN npm test'))fail('Dockerfile must run production smoke tests');else ok('Dockerfile runs production smoke tests');
if(pkg.scripts?.test!=='node --check server.js && node scripts/smoke.mjs')fail('package test must include server syntax check');else ok('package test includes server syntax check');

if(!server.includes('error.code = "text_overlay_render_failed"'))fail('text overlay guard failure code missing');else ok('text overlay guard failure code present');
if(!server.includes('textPixels < 80'))fail('text overlay pixel threshold missing');else ok('text overlay pixel threshold present');

if(!server.includes('fontRenderState.ready && textOverlayGuardState.ready'))fail('health must gate on font and overlay guard');else ok('health gates on font and overlay guard');

if(!server.includes('visualQaVersion: 5'))fail('local QA v5 response marker missing');else ok('local QA v5 response marker present');
if(!html.includes('syncQualityDownloadState'))fail('QA download gate missing');else ok('QA download gate present');
if(!html.includes('Скачивание заблокировано: QA нашла карточки'))fail('blocked package messaging missing');else ok('blocked package messaging present');
if(!html.includes('for(let round=0;round<3;round+=1)'))fail('bounded multi-round auto-fix missing');else ok('bounded multi-round auto-fix present');

if(!html.includes("state:'qa_blocked'"))fail('Excel QA quarantine state missing');else ok('Excel QA quarantine state present');
if(!html.includes("Товар сохранён локально в карантин и не добавлен в общий ZIP"))fail('Batch ZIP quarantine gate missing');else ok('Batch ZIP quarantine gate present');
if(!html.includes("batchQaPassed(item.quality)?'Да':'Нет'"))fail('catalog QA report must require passed QA');else ok('catalog QA report requires passed QA');
if(!html.includes("needsQa=cardsReady&&!batchQaPassed(item.quality)"))fail('Excel queue must refresh stale QA schemas');else ok('Excel queue refreshes stale QA schemas');

if(html.includes('<option value="ai">'))fail('paid image-AI option must not be exposed');else ok('paid image-AI option removed from UI');
if((server.match(/const mode = "free";/g)||[]).length<2)fail('image endpoints must force free mode');else ok('image endpoints force free mode');
if(!server.includes('aiMode: false'))fail('health must report image AI disabled');else ok('health reports image AI disabled');
if(!server.includes('aiImageCalls: 0'))fail('image responses must report zero image-AI calls');else ok('image responses report zero image-AI calls');
if(!html.includes('Studio Local · бесплатно · 0 image-AI'))fail('Studio Local free UI label missing');else ok('Studio Local free UI label present');
if(!server.includes('filter id="studioBlur"'))fail('studio lighting filter missing');else ok('studio lighting filter present');

if(!server.includes('regenerativeQaRepair: true'))fail('regenerative QA repair metadata missing');else ok('regenerative QA repair metadata present');
if(!server.includes('repairAttempt = 0'))fail('repair attempt input missing');else ok('repair attempt input present');
if(!server.includes('studioProfile = buildStudioProfile'))fail('single-card Studio Director integration missing');else ok('single-card Studio Director integration present');
if(!html.includes("repairAttempt:round"))fail('batch QA must vary repair scene');else ok('batch QA varies repair scene');
if(!html.includes("repairAttempt,designIntensity"))fail('interactive QA must vary repair scene');else ok('interactive QA varies repair scene');
if(!html.includes("show-excel"))fail('compact UI Excel reveal missing');else ok('compact UI Excel reveal present');
if(!html.includes("show-editor"))fail('compact UI editor reveal missing');else ok('compact UI editor reveal present');
if(!html.includes("Quality Score"))fail('Quality Score UI missing');else ok('Quality Score UI present');
if(!html.includes('Авто · арт-директор'))fail('batch art director selector missing');else ok('batch art director selector present');

if(!server.includes('zeroCreditTextFallback: true'))fail('zero-credit text fallback metadata missing');else ok('zero-credit text fallback metadata present');
if(!server.includes('analysisMode: "local-fallback"'))fail('local fallback response missing');else ok('local fallback response present');
if(!server.includes('credit_balance_exhausted" || error?.status === 401'))fail('credit fallback path missing');else ok('credit fallback path present');
if(!html.includes('currentStaleCards=[0,1,2,3];currentScenes=[]'))fail('post-analysis full scene refresh missing');else ok('post-analysis full scene refresh present');
if(!html.includes('currentStaleCards.length<4'))fail('full-set stale cards must bypass overlay-only rebuild');else ok('full-set stale cards bypass overlay-only rebuild');

if(!server.includes('browserVisionFallback: true'))fail('browser vision fallback metadata missing');else ok('browser vision fallback metadata present');
if(!server.includes('uniqueMultiAngleRouting: true'))fail('unique multi-angle routing metadata missing');else ok('unique multi-angle routing metadata present');
if(!server.includes('/api/local-vision-normalize'))fail('local vision normalize endpoint missing');else ok('local vision normalize endpoint present');
if(!html.includes("new Worker('/local-vision-worker.js?v=11.0.0'"))fail('local vision worker hook missing');else ok('local vision worker hook present');
if(!html.includes('upgradeFallbackWithBrowserVision'))fail('browser vision fallback integration missing');else ok('browser vision fallback integration present');
if(!server.includes('const slot=Math.min(ranked.length-1,Math.max(0,index-1))'))fail('unique angle slot routing missing');else ok('unique angle slot routing present');

if(!server.includes('name === "index.html" || name === "sw.js" || name === "local-vision-worker.js"'))fail('fresh-shell cache headers missing');else ok('fresh-shell cache headers present');
if(!html.includes("register('/sw.js?v=28',{updateViaCache:'none'})"))fail('service worker forced update missing');else ok('service worker forced update present');

if(!html.includes('CARD_RENDER_SCHEMA=4'))fail('Studio Director v11 old-card invalidation missing');else ok('Studio Director v11 old-card invalidation present');

if(!server.includes('smolVlmWasmFallback: true'))fail('SmolVLM WASM fallback metadata missing');else ok('SmolVLM WASM fallback metadata present');
if(!server.includes('perCardSceneVariants: true'))fail('per-card scene variants metadata missing');else ok('per-card scene variants metadata present');
if(!server.includes('transformProductForScene'))fail('safe product scene transform missing');else ok('safe product scene transform present');
if(!server.includes('sceneVariant=Number.isInteger'))fail('scene-specific background variant missing');else ok('scene-specific background variant present');
if(!html.includes("local-vision-worker.js?v=11.0.0"))fail('vision worker cache bust missing');else ok('vision worker cache bust present');
if(!worker.includes('/+esm'))fail('worker ESM CDN endpoint missing');else ok('worker ESM CDN endpoint present');
if(!worker.includes('dtype:"q8"'))fail('worker WASM q8 fallback missing');else ok('worker WASM q8 fallback present');
if(!worker.includes('sequences[0].slice(inputLength)'))fail('generated-only vision decode missing');else ok('generated-only vision decode present');
if(!sw.includes("url.pathname==='/local-vision-worker.js'"))fail('service worker vision bypass missing');else ok('service worker vision bypass present');

if(!server.includes('Преобладающий цвет на фото'))fail('guaranteed visible fallback characteristic missing');else ok('guaranteed visible fallback characteristic present');
if(html.includes('const needsVisionUpgrade='))fail('obsolete nonblocking vision race flag still present');else ok('obsolete nonblocking vision race flag removed');
if(!html.includes('improveProductWithLocalVisionInBackground'))fail('legacy recovery helper missing');else ok('legacy recovery helper retained');
if(!html.includes("const improved=await upgradeFallbackWithBrowserVision(provisional,src)"))fail('final local vision before first render missing');else ok('final local vision before first render present');
if(!html.includes("register('/sw.js?v=28'"))fail('service worker v28 registration missing');else ok('service worker v28 registration present');
if(!sw.includes("yuvion-ai-shell-v28"))fail('service worker v28 cache missing');else ok('service worker v28 cache present');
if(!server.includes('freeTextLocalFirst: true'))fail('local-first text analysis metadata missing');else ok('local-first text analysis metadata present');
if(!server.includes('freeLocalPreflight: true'))fail('free local preflight metadata missing');else ok('free local preflight metadata present');
if(!server.includes('finalDataBeforeCardRender: true'))fail('final-data-first metadata missing');else ok('final-data-first metadata present');
if(!server.includes('minimalUiFlow: true'))fail('minimal UI metadata missing');else ok('minimal UI metadata present');
if(!server.includes('autopilotV11: true'))fail('v11 autopilot metadata missing');else ok('v11 autopilot metadata present');
if(!server.includes('coverOptimizerVariants: 4'))fail('best-of-four cover optimizer metadata missing');else ok('best-of-four cover optimizer metadata present');
if(!server.includes('candidateVariants=[0,1,2,3]'))fail('four cover candidates missing');else ok('four cover candidates present');
if(!server.includes('qaSelfRepairRounds: 3'))fail('three-round QA metadata missing');else ok('three-round QA metadata present');
if(!server.includes('sourcePhotoRetakeGate: true'))fail('source photo retake gate missing');else ok('source photo retake gate present');
if(!server.includes('reshootRecommended'))fail('source retake recommendation missing');else ok('source retake recommendation present');
if(!server.includes('prepareDetailCrop'))fail('truthful detail zoom helper missing');else ok('truthful detail zoom helper present');
if(!server.includes('threeStageEdgeFeathering: true'))fail('three-stage cutout feathering metadata missing');else ok('three-stage cutout feathering metadata present');
if(!server.includes('/api/local-label-hints'))fail('free local label hints endpoint missing');else ok('free local label hints endpoint present');
if(!html.includes('detectBrowserLabelFields'))fail('browser local label reader missing');else ok('browser local label reader present');
if(!html.includes('id="simplePhotoAdvice"'))fail('minimal photo advice missing');else ok('minimal photo advice present');
if(!html.includes('Лучше переснять фото'))fail('retake-photo UX missing');else ok('retake-photo UX present');
if(!html.includes('autoVisualRevision'))fail('automatic visual revision history missing');else ok('automatic visual revision history present');
if(!html.includes('id="minimalVersionsSheet"'))fail('minimal visual versions sheet missing');else ok('minimal visual versions sheet present');
if(!html.includes('applyCatalogRelations'))fail('automatic catalog series style missing');else ok('automatic catalog series style present');
if(!html.includes('probableDuplicateId'))fail('semantic duplicate warning missing');else ok('semantic duplicate warning present');
if(!html.includes('resumePersistedQueueIfNeeded'))fail('persistent queue auto-resume missing');else ok('persistent queue auto-resume present');
if(!html.includes('autoResume:true'))fail('queue auto-resume state missing');else ok('queue auto-resume state present');
if(!html.includes('const skuIndex=new Map(),barcodeIndex=new Map(),urlIndex=new Map()'))fail('Excel URL index declaration missing');else ok('Excel URL index declaration present');
if(!html.includes("maxRounds=3"))fail('batch QA three-round repair missing');else ok('batch QA three-round repair present');
if(!html.includes("await checkQualityAndAutofix(true)"))fail('immediate flow does not self-repair QA');else ok('immediate flow self-repairs QA');
if(!html.includes('id="simpleDonePanel"'))fail('minimal completion screen missing');else ok('minimal completion screen present');

if(!html.includes('id="minimalMenu"'))fail('minimal top menu missing');else ok('minimal top menu present');
if(!html.includes('id="simpleResult"'))fail('compact result card missing');else ok('compact result card present');
if(!html.includes('id="simpleStyle"'))fail('simple style selector missing');else ok('simple style selector present');
if(!html.includes('minimal-card-menu'))fail('minimal per-card menu missing');else ok('minimal per-card menu present');
if(!html.includes("applyUiMode('simple',{save:false})"))fail('simple UI is not default');else ok('simple UI default enforced');
if(!html.includes('.simple-ui .workflow,.simple-ui .focus-panel,.simple-ui .smart-strip{display:none!important}'))fail('legacy navigation not hidden in simple mode');else ok('legacy navigation hidden in simple mode');

if(!server.includes('singlePhotoTruthfulVariation: true'))fail('single-photo truthful variation metadata missing');else ok('single-photo truthful variation metadata present');
if(!html.includes("const complete=await createImmediateFreeCards(file)"))fail('duplicate analysis suppression missing');else ok('duplicate analysis suppression present');
if(!html.includes("if(provisional.analysisMode==='local-fallback')"))fail('pre-render local vision finalization missing');else ok('pre-render local vision finalization present');
if(html.includes("window.setTimeout(()=>improveProductWithLocalVisionInBackground(src,productId,baseData),250)"))fail('background vision race trigger still active');else ok('background vision race trigger removed');
if(!server.includes('extractProductPalette(buffer)'))fail('photo color enrichment missing');else ok('photo color enrichment present');
if(!server.includes('if (index > 0 && !secondarySourceBuffer)'))fail('single-photo detail variation missing');else ok('single-photo detail variation present');

if(!server.includes('recordError("preflight-local"'))fail('local preflight route missing');else ok('local preflight route present');
if(!worker.includes('Xenova/mobilevit-xx-small'))fail('mobile classifier fallback missing');else ok('mobile classifier fallback present');
if(!worker.includes('classifierMode:true'))fail('classifier result marker missing');else ok('classifier result marker present');
if(!server.includes('localizeVisionLabel'))fail('vision label localization missing');else ok('vision label localization present');
if(!server.includes('width="772" height="108"'))fail('visible description panel missing');else ok('visible description panel present');

if(!server.includes('preferLocal === true'))fail('local-first analyze branch missing');else ok('local-first analyze branch present');
if(!html.includes('requestImmediateLocalCard'))fail('immediate local description helper missing');else ok('immediate local description helper present');
if(!html.includes('preferLocal:true'))fail('frontend local-first analyze request missing');else ok('frontend local-first analyze request present');
if(server.includes('}\n  try { visual = { ...visual, product: await transformProductForScene(visual.product,index) };'))fail('whole photo panel rotation regression present');else ok('whole photo panels are not rotated');
if(html.includes("const response=await fetch('/api/label-ocr',{method:'POST'"))fail('paid OCR still wired into automatic/main label flow');else ok('main label flow avoids paid OCR');


