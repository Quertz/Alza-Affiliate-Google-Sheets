/** Alza Affiliate → Google Sheets PUBLIC v1.0.1 (one affiliate account per sheet). */
const AFF = Object.freeze({
  base: 'https://affiliate.alza.cz',
  timezone: 'Europe/Prague',
  pageSize: 1000,
  maxPages: 300,
  itemsPerRun: 25,
  maxItemsRuntimeMs: 230000,
  tolerance: 0.05,
  sheets: Object.freeze({
    dashboard: 'Dashboard', summary: 'Souhrn', log: 'Sync Log',
    profit: 'Denní profit', documents: 'Doklady', daily: 'Provize po dnech',
    items: 'Polozky', itemState: 'Polozky sync status',
    products: 'Produkty', hours: 'TOP Hodiny life',
    monthHours: 'TOP Hodiny Měsíc', payouts: 'Alza vyúčtování',
    topWeeks: 'TOP10 týdny', topMonths: 'TOP10 měsíce'
  }),
  handlerDocs: 'autoAffiliateSync', handlerItems: 'autoAffiliateItems',
  credentialsKeys: Object.freeze({email:'AFF_EMAIL',password:'AFF_PASSWORD',start:'AFF_START',idp:'AFF_IDP'})
});

const H = Object.freeze({
  documents: ['IDP','ID dokladu','Objednávka','Datum dokladu','Čas dokladu (zdroj)','Typ','Provize','Obrat','Měna','Uzavřeno','ID vyúčtování','Stav vyúčtování','Zdroj','Naposledy viděno','campaign','banner_id','bannerName','referrer','source'],
  payouts: ['ID vyúčtování','Datum vyúčtování','Stav','Provize','Součet dokladů','Rozdíl','Počet dokladů','Měna','Kontrola','Naposledy viděno'],
  daily: ['Datum','Měna','Kladné provize','Dobropisy','Čisté provize','Počet dokladů'],
  profit: ['Datum','Měna','Provize'],
  summary: ['Ukazatel','Hodnota'],
  items: ['ID dokladu','ID položky','Objednávka','Datum dokladu','Hodina dokladu','Kód produktu','Odkaz na produkt','Kusy','Cena položky (API)','Provizní sazba %','Fixní provize','Provize položky','Měna','ID vyúčtování','Popis provize','campaign','banner_id','bannerName','referrer','source'],
  itemState: ['ID dokladu','Datum dokladu','Měna','Položek dle API','Staženo položek','Součet položek','Provize dokladu','Rozdíl','Stav','Kontrola UTC'],
  products: ['Kód produktu','Měna','Počet objednávek','Počet dokladů','Kusů','Součet hodnot price (API)','Provize netto','Poslední datum','Odkaz','campaign','banner_id','bannerName','referrer','source'],
  hours: ['Hodina','Měna','Počet objednávek','Počet dokladů','Provize'],
  monthHours: ['Měsíc','Hodina','Měna','Počet objednávek','Počet dokladů','Provize'],
  top: ['Období','Pořadí','Kód produktu','Měna','Provize netto','Počet objednávek','Počet dokladů','Kusů','Odkaz'],
  log: ['Čas UTC','Úloha','Stav','Popis']
});

function affProps_() { return PropertiesService.getUserProperties(); }
function affConfig_() {
  const p = affProps_(), email=p.getProperty(AFF.credentialsKeys.email);
  const password=p.getProperty(AFF.credentialsKeys.password);
  const start=p.getProperty(AFF.credentialsKeys.start);
  if (!email || !password || !/^\d{4}-\d{2}-\d{2}$/.test(start||''))
    throw new Error('Nejdříve dokončete instalaci v menu Alza Affiliate → Nastavení.');
  return {email,password,start,idp:p.getProperty(AFF.credentialsKeys.idp)||''};
}
function affDate_(value) {
  if (Object.prototype.toString.call(value)==='[object Date]') return Utilities.formatDate(value,AFF.timezone,'yyyy-MM-dd');
  const match=/^(\d{4}-\d\d-\d\d)/.exec(String(value||''));
  return match?match[1]:'';
}
function affSafe_(value) {
  const str=String(value===null||value===undefined?'':value);
  return /^[=+@\-\t\r]/.test(str) ? "'"+str : str;
}
function affNumber_(value,label) {
  if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))
    throw new Error('Neplatná číselná hodnota: '+label);
  return Number(value);
}
function affUtc_() {return new Date().toISOString();}
function affLock_(action) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'BUSY'};
  try{return action();}finally{lock.releaseLock();}
}
