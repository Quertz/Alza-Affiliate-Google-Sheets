# Bezpečnost a soukromí

## Uložení přístupu

Instalační HTML dialog používá pole `type=password`, potom `google.script.run` volá serverovou funkci `setupAffiliate` ve vlastním Google Apps Script projektu. Funkce autentizuje účet přímo na `https://affiliate.alza.cz/` a uloží `AFF_EMAIL`, `AFF_PASSWORD`, `AFF_IDP`, `AFF_START` do **Google Apps Script User Properties**. Tyto hodnoty nejsou uložené v Github repozitáři ani v buňkách Google Sheets.

To **není** vault. Každý, kdo může měnit zdrojový kód Apps Scriptu spuštěný pod vlastníkovým účtem, může potenciálně získat data nebo přiřazená hesla. **Google Sheet a skript nesdílejte s dalšími editory.** Oprávnění pro přístup k datům udělujte minimálně, případně si vytvořte nový sešit a do nějsi natahujte informace z tohoto bez logiky na pozadí.

## Ověření oprávnění a izolace

Skript ověřuje IDP, při odlišném účtu odmítne přepsat existující historii. Časové spouštěče běží pod vlastníkem, který je vytvořil. Jiný partner (pokud máte) patří do jiného Sheetu. Při přístupu k jinému účtu nepřepisujte data původního partnera, začne se tím částečně přepisovat historie.

## Co skript nedělá

- Nemá žádný endpoint pro veřejnou instalaci ani pro příjem affiliate přihlašovacího hesla.
- **Volitelná iPhone Gateway** má pouze `doPost` na získání agregovaných provizí, chráněný dlouhým separátním secretem v těle JSON. `doGet` data nikdy nevydává.
- Pro veřejnou webovou aplikaci je nutné **Spustit jako já**; upozorňuji, že tím dáváte nasazenému skriptu vlastní Google oprávnění. Secret není náhrada za bezpečnostní revizi zdrojového kódu.
- Secret se ukládá do User Properties a zobrazuje se jen v uživatelském nastavení v Google Sheetu. Jde o bearer token: kdo jej získá, může číst souhrnné statistiky; není to end-to-end šifrovaný vault.
- Web App `/exec` je dostupná na internetu, i když je gateway deaktivovaná; skutečné vyřazení veřejné adresy vyžaduje odstranění nasazení.
- Gateway vrací jen číselné souhrny, synchronizační čas a datum přijatého vyúčtování. Nevrací heslo, e-mail, orderCode ani seznam produktů. Neodesílejte secret v query parametru ani v GET URL.
- Neodesílá hesla ani data autorovi projektu, na web analytics ani na vlastní externí server.
- Nepoužívá žádný administrátorský účet nebo impersonační oprávnění.
- Nic v Alze neupravuje, zatím :-).
- Hesla ani cookies nezapisuje do `Sync Log`, do Sheets ani do GitHub testovacích fixture.

## Incidenty a rušení instalace

V menu `Alza Affiliate → Zastavit automatiku` smažete jen dva časovače. **Heslo tím není smazáno.** Pro vyřazení pověření otevřete Google Apps Script → `Nastavení projektu`, nebo spusťte vlastní vlastníkem autorizovanou funkci `PropertiesService.getUserProperties().deleteProperty('AFF_PASSWORD')` a obdobně ostatní `AFF_*` hodnoty. Neprovádějte tento zásah ve veřejně sdíleném projektu. Smazání tabulky ani odstranění časovače samo o sobě nezaručuje odstranění pověření z historie projektů či účtu.

## Změny upstream API

Provoz při změně interního Alza API může vyžadovat úpravu kódu. Nesnažte se obcházet ochranné mechanismy serveru, blokace nebo přístupová práva, Cloudflare na Alze to pozná a začne se bránit.
