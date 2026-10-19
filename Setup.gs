/** Interactive installer. No web-app deployment, no external credential proxy. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Alza Affiliate')
    .addItem('Nastavení / instalace', 'openAffiliateSetup')
    .addSeparator()
    .addItem('Synchronizovat provize teď', 'runAffiliateNow')
    .addItem('Synchronizovat položky teď', 'runAffiliateItemsNow')
    .addItem('Zastavit automatiku', 'stopAffiliateAutomation')
    .addToUi();
}
function openAffiliateSetup() {
  const html=HtmlService.createHtmlOutputFromFile('Setup').setWidth(480).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html,'Alza Affiliate – instalace');
}
function setupAffiliate(input) {
  if(!input || typeof input!=='object')throw new Error('Chybějící konfigurace.');
  const email=String(input.email||'').trim();
  const password=String(input.password||'');
  const start=String(input.start||'2026-01-01');
  if(email.length>200 || !/^\S+@\S+\.\S+$/.test(email))throw new Error('Vyplňte platný e-mail.');
  if(password.length<1 || password.length>500)throw new Error('Zadejte heslo.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || isNaN(Date.parse(start+'T12:00:00Z')) ||
      new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start)
    throw new Error('Chybné počáteční datum YYYY-MM-DD.');
  if(start>Utilities.formatDate(new Date(),AFF.timezone,'yyyy-MM-dd'))
    throw new Error('Počáteční datum nesmí být v budoucnosti.');
  // Verify upstream before persisting any credentials.
  const cookie=affLogin_(email,password);
  const identity=affIdentity_(cookie);
  const props=affProps_();
  const prevIdp=props.getProperty(AFF.credentialsKeys.idp);
  if(prevIdp && prevIdp!==identity.idp && affBook_().getSheetByName(AFF.sheets.documents)?.getLastRow()>1)
    throw new Error('List už obsahuje data jiného partnerského IDP. Použijte nový prázdný Google Sheet.');
  affCreateTabs_();
  props.setProperties({
    AFF_EMAIL:email,AFF_PASSWORD:password,AFF_START:start,AFF_IDP:identity.idp
  });
  installAffiliateAutomation_();
  affLog_('INSTALACE','OK','Nastaven jeden affiliate účet a časovače 4h/2h.');
  return {message:'Instalace dokončena. Provize se budou stahovat každé 4 hodiny a produkty každé 2 hodiny.',
    idp:identity.idp,start:start};
}
function installAffiliateAutomation_() {
  const handlers=[AFF.handlerDocs,AFF.handlerItems];
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(handlers.indexOf(t.getHandlerFunction())>=0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(AFF.handlerDocs).timeBased().everyHours(4).create();
  ScriptApp.newTrigger(AFF.handlerItems).timeBased().everyHours(2).create();
}
function stopAffiliateAutomation() {
  ScriptApp.getProjectTriggers().forEach(t=>{
    if([AFF.handlerDocs,AFF.handlerItems].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);
  });
  affLog_('AUTOMATIZACE','STOP','Odstraněny časové spouštěče této aplikace.');
}
function runAffiliateNow() {return autoAffiliateSync();}
function runAffiliateItemsNow() {return autoAffiliateItems();}
function autoAffiliateSync() {
  const result=affLock_(()=>{
    try {
      const r=affSyncDocuments_();
      affLog_('PROVIZE','OK','Dokladů '+r.documents+', vyúčtování '+r.payouts+'.');
      return r;
    }catch(e){affLog_('PROVIZE','CHYBA','Synchronizace selhala; údaje zůstaly zachovány.');throw e;}
  });
  return result;
}
function autoAffiliateItems() {
  return affLock_(()=>{
    try {
      const r=affSyncItems_();
      affLog_('POLOŽKY',r.errors?'VAROVÁNÍ':'OK','Kontrolováno '+r.checked+', položek '+r.items+', chyb '+r.errors+'.');
      return r;
    }catch(e){affLog_('POLOŽKY','CHYBA','Synchronizace selhala; údaje zůstaly zachovány.');throw e;}
  });
}
