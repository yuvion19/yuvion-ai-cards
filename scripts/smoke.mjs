import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const server=fs.readFileSync('server.js','utf8');

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
  ['renderMode = "free"','free rendering default'],
  ['freeSceneRenders','free render telemetry'],
  ['MAX_FREE_CARD_BATCHES_PER_WINDOW','separate free batch limit'],
  ['freeCardRequestsByIp','free render limiter separated from AI limiter'],
  ['freeImageAiCalls: 0','health confirms zero image-AI calls for free mode'],
  ['Создать 4 карточки бесплатно','free mode is explicit in UI'],
  ['autoCreateCardsIfEnabled','automatic four-card workflow'],
  ['recommendedStyleForProduct','category-aware style recommendation'],
  ['edgeWhiteCutout','free white-background cutout'],
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
  ['AbortController','client analysis timeout'],
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
  ['renderSelections = [0, 1, 2, 3]','card-specific source routing'],
  ['powerLocalRenderer: true','power renderer health metadata'],
  ['multiPhotoScenes: true','multi-photo health metadata'],
  ['additionalPhotosForRender','client render-photo payload']
];
for(const [needle,label] of features){
  if(!(html.includes(needle)||server.includes(needle)))fail(label+' missing');else ok(label);
}

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
if(!server.includes('version: "7.6.0'))fail('server health version is not 7.6.0');else ok('server health version 7.6.0');
