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
  'productUrlInput','importProductUrl','urlImportStatus','sourceReference'
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
  ['embeddedPublicJson','modern storefront embedded JSON fallback']
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
