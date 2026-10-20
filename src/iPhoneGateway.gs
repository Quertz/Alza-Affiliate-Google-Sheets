/**
 * Optional read-only iPhone Shortcuts gateway. Web app: execute as owner.
 * POST JSON {"secret":"..."} – NEVER put the secret in the URL.
 * No affiliate credentials or document line items leave this endpoint.
 */
const AFF_PHONE = Object.freeze({
  enabled:'AFF_PHONE_ENABLED', secret:'AFF_PHONE_SECRET',
  spreadsheet:'AFF_SPREADSHEET_ID', lastDocsSync:'AFF_LAST_DOCS_SYNC'
});

/** Generate two independent UUIDv4 strings (~244 random bits if implementation is random). */
function affPhoneNewSecret_() {
  return Utilities.getUuid()+'-'+Utilities.getUuid();
}
function affPhoneConfigure_(requested) {
  const props=affProps_();
  const enabled=requested===true;
  if(enabled){
    if(!props.getProperty(AFF_PHONE.secret))props.setProperty(AFF_PHONE.secret,affPhoneNewSecret_());
    props.setProperty(AFF_PHONE.spreadsheet,affBook_().getId());
  }
  props.setProperty(AFF_PHONE.enabled,enabled?'true':'false');
  return enabled;
}
/** Menu dialog – only accessible to the Google Sheet editor. */
function openIPhoneGateway() {
  const html=HtmlService.createHtmlOutputFromFile('PhonePanel').setWidth(580).setHeight(670);
  SpreadsheetApp.getUi().showModalDialog(html,'Připojení iPhone Zkratek');
}
function getIPhoneGatewaySettings() {
  const props=affProps_();
  const enabled=props.getProperty(AFF_PHONE.enabled)==='true';
  const secret=enabled?props.getProperty(AFF_PHONE.secret)||'':'';
  let url='';
  try {url=String(ScriptApp.getService().getUrl()||'');}catch(_err){}
  return {enabled,secret,url};
}
function updateIPhoneGateway(enabled) {
  const props=affProps_();
  if(!props.getProperty(AFF.credentialsKeys.idp))throw new Error('Nejprve dokončete instalaci Alza Affiliate.');
  affPhoneConfigure_(enabled===true);
  return getIPhoneGatewaySettings();
}
function rotateIPhoneGatewaySecret() {
  const props=affProps_();
  if(props.getProperty(AFF_PHONE.enabled)!=='true')throw new Error('Nejprve povolte iPhone Gateway.');
  props.setProperty(AFF_PHONE.secret,affPhoneNewSecret_());
  // Existing Shortcuts immediately stop working until they use the new secret.
  return getIPhoneGatewaySettings();
}
function affPhoneJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/** GET intentionally never returns affiliate data. */
function doGet() {
  return affPhoneJson_({ok:false,error:'POST_REQUIRED'});
}
function affPhoneSameSecret_(a,b){
  // Constant-work comparison for strings of the same maximum length.
  const x=String(a||''),y=String(b||'');
  let mismatch=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) mismatch|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);
  return mismatch===0;
}
/** Only one read-only action. Never expose a generic query/path dispatcher. */
function doPost(e) {
  try{
    const p=affProps_();
    if(p.getProperty(AFF_PHONE.enabled)!=='true')return affPhoneJson_({ok:false,error:'DISABLED'});
    const data=e&&e.postData&&String(e.postData.contents||'');
    if(!data||data.length>4096)return affPhoneJson_({ok:false,error:'UNAUTHORIZED'});
    let request;
    try {request=JSON.parse(data);}catch(_err){return affPhoneJson_({ok:false,error:'UNAUTHORIZED'});}
    if(!request || typeof request.secret!=='string' || !affPhoneSameSecret_(request.secret,p.getProperty(AFF_PHONE.secret)))
      return affPhoneJson_({ok:false,error:'UNAUTHORIZED'});
    const bookId=p.getProperty(AFF_PHONE.spreadsheet);
    if(!bookId)return affPhoneJson_({ok:false,error:'NOT_CONFIGURED'});
    // Reuse the same script lock as the document importer. Prevent reading
    // a half-written archive while affSyncDocuments_ replaces Sheet rows.
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(1500))return affPhoneJson_({ok:false,error:'BUSY'});
    try{
      // Open the owner's installed Sheet by ID, not the active UI document.
      const sheet=SpreadsheetApp.openById(bookId);
      const result=affPhonePayload_(sheet,p.getProperty(AFF_PHONE.lastDocsSync));
      return affPhoneJson_(result);
    }finally{lock.releaseLock();}
  }catch(_err){
    // No internal exception, spreadsheet content or credentials in public responses.
    return affPhoneJson_({ok:false,error:'UNAVAILABLE'});
  }
}
function affPhonePrevDay_(day) {
  const parts=day.split('-').map(Number);
  return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]-1,12)).toISOString().slice(0,10);
}
function affPhoneCalendarDiff_(newer,older) {
  const millis=s=>{
    const a=s.split('-').map(Number);
    return Date.UTC(a[0],a[1]-1,a[2]);
  };
  return Math.round((millis(newer)-millis(older))/86400000);
}
function affPhoneDate_(v){return affDate_(v);}
function affPhoneFormatInt_(n){
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
}
function affPhoneFormat_(n){
  // Numeric values are kept numeric in JSON. Only ready-made message is formatted.
  const parts=Number(n).toFixed(2).split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ') + ',' + parts[1];
}
function affPhoneCounts_(r,day,yesterday){
  const date=affPhoneDate_(r[3]);
  const amount=Number(r[6]),currency=String(r[8]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(amount)||!/^[A-Z]{3}$/.test(currency))
    throw new Error('Nevalidní doklad pro gateway.');
  return {date,amount,currency};
}
/** Pure transformation, testable without network or Google UI. */
function affPhoneAggregate_(documents,payouts,today,lastSync) {
  const yesterday=affPhonePrevDay_(today);
  const byCurrency=new Map();
  const newBucket=()=>({commission:0,documents:0});
  for(const r of documents){
    const item=affPhoneCounts_(r,today,yesterday);
    if(!byCurrency.has(item.currency))byCurrency.set(item.currency,{
      total:newBucket(),today:newBucket(),yesterday:newBucket()
    });
    const a=byCurrency.get(item.currency);
    a.total.commission+=item.amount;a.total.documents++;
    if(item.date===today){a.today.commission+=item.amount;a.today.documents++;}
    if(item.date===yesterday){a.yesterday.commission+=item.amount;a.yesterday.documents++;}
  }
  let lastClosureDate=null;
  for(const p of payouts){
    // 'Přijato' is an accepted settlement REQUEST, not proof of payment/transfer.
    if(String(p[2])!=='Přijato')continue;
    const d=affPhoneDate_(p[1]);
    if(d && d<=today && (!lastClosureDate||d>lastClosureDate))lastClosureDate=d;
  }
  const daysSinceLastClosure=lastClosureDate?affPhoneCalendarDiff_(today,lastClosureDate):null;
  const currencies=Array.from(byCurrency.keys()).sort();
  const list=currencies.map(currency=>Object.assign({currency},byCurrency.get(currency)));
  const sync=lastSync && !Number.isNaN(Date.parse(lastSync))?new Date(lastSync):null;
  const lastSyncTime=sync?Utilities.formatDate(sync,AFF.timezone,'HH:mm'):null;
  const response={ok:true,timezone:AFF.timezone,asOfDate:today,
    lastSync:sync?sync.toISOString():null,lastSyncTime,
    lastClosureDate,daysSinceLastClosure,
    currencies:list,
    currency:null,totalCommission:null,yesterdayCommission:null,todayCommission:null,
    totalDocuments:null,yesterdayDocuments:null,todayDocuments:null,
    notification:null};
  if(currencies.length===1){
    const currency=currencies[0],data=byCurrency.get(currency);
    response.currency=currency;
    response.totalCommission=data.total.commission;
    response.yesterdayCommission=data.yesterday.commission;
    response.todayCommission=data.today.commission;
    response.totalDocuments=data.total.documents;
    response.yesterdayDocuments=data.yesterday.documents;
    response.todayDocuments=data.today.documents;
    const unit=currency==='CZK'?'Kč':currency;
    response.notification=[
      'Celkem '+affPhoneFormat_(response.totalCommission)+' '+unit+' ('+affPhoneFormatInt_(response.totalDocuments)+' Dok)',
      'Včera '+affPhoneFormat_(response.yesterdayCommission)+' '+unit+' ('+affPhoneFormatInt_(response.yesterdayDocuments)+' Dok)',
      'Dnes '+affPhoneFormat_(response.todayCommission)+' '+unit+' ('+affPhoneFormatInt_(response.todayDocuments)+' Dok)',
      'Poslední sync '+(lastSyncTime||'—')
    ].join('\n');
  }else if(currencies.length===0){
    response.currency=null;
    response.totalDocuments=0;response.todayDocuments=0;response.yesterdayDocuments=0;
  }else{
    response.warning='MULTI_CURRENCY'; // Money sums across currencies are not defined.
  }
  return response;
}
function affPhonePayload_(book,lastSync){
  const docs=book.getSheetByName(AFF.sheets.documents);
  const pays=book.getSheetByName(AFF.sheets.payouts);
  if(!docs||!pays)throw new Error('Chybí listy.');
  const read=(sheet,count)=>sheet.getLastRow()>1?
    sheet.getRange(2,1,sheet.getLastRow()-1,count).getValues():[];
  // No credentials, partner email or order identifiers enter response.
  const today=Utilities.formatDate(new Date(),AFF.timezone,'yyyy-MM-dd');
  return affPhoneAggregate_(read(docs,H.documents.length),read(pays,H.payouts.length),today,lastSync);
}
