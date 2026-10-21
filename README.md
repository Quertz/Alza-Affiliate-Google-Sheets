# Alza Affiliate → Google Sheets

**Verze 1.0.0** · neoficiální komunitní konektor.

Stahuje provize, dobropisy, jednotlivé doklady, vyúčtování a položky produktů do Google Sheets. Pro jedno IDP v jeho vlastním Google účtu. Máte víc IDP? Udělejte si víc Sheetů a v jednom Master propojte, určitě si poradíte.

> **Stahujte než to smažou!** Interní endpointy Alza Affiliate nejsou veřejně garantované, občas vás chytne Cloudflare, občas Šlachta. Lokální testy používají syntetické odpovědi. Cílem je lepší optimalizace kampaní a lepší přehled o výdělku v rámci Alza Affiliate.

## Instalace (10 minut)

1. Založ **novou prázdnou Google tabulku**.
2. Otevři **Rozšíření → Apps Script**.
3. Ze složky `src/` vytvoř ve stejné tabulce soubory typu skript: `Config.gs`, `Api.gs`, `Sheets.gs`, `Setup.gs`, `Sync.gs`, `Items.gs`, `iPhoneGateway.gs`. Každý má v Apps Scriptu své jméno **bez přípony `.gs`**. Předvytvořený prázdný `Kód.gs` můžeš odstranit. Všechny jména souborů jsou CASE-SENSITIVE, tak si dávej pozor.
4. Vytvoř soubor typu **HTML** s přesným názvem **`Set`** a vlož obsah `src/Set.html`. Dále vytvoř HTML soubor **`PhonePanel`** a vlož `src/PhonePanel.html`. Používá se `HtmlService.createHtmlOutputFromFile('Set')`, tedy velké `S`. 
5. Volitelně nahraď manifest `appsscript.json` (Nastavení projektu → zobrazit manifest); doporučená časová zóna `Europe/Prague` je již v něm.
6. Vše ulož, vylez a zalez zpět (nebo) obnov Google Sheet a v horním menu se za chvilku na posledním místě objeví (a tedy zvol) **Alza Affiliate → Nastavení / instalace**.
7. Zadej svůj affiliate e-mail, heslo a datum historie odkdy se má synchronizovat (upozorňuji, že letité účty mohou trva několik dní až týdnů než bude komplet historie). Volitelně zaškrtni **Povolit iPhone Zkratky** (standardně vypnuto). Instalátor ověří aktuálního uživatele přes Alza Affiliate, vytvoří listy a **dva časovače**.
8. V menu spusť **Synchronizovat provize teď** a poté **Synchronizovat položky teď**. V listu `Sync Log` ověř výsledek. Další dávky už poběží samy.

Po vložení souborů už **není potřeba další instalační skript ani server**. Instalaci nelze provést pouhým importem ZIP do Google Sheets. Pokud je v novém Sheetu jediný prázdný výchozí list, automaticky se změní na `Dashboard`.

### Automatika

| Funkce | Interval | Účel |
|---|---|---|
| `autoAffiliateSync` | **4 hodiny** | Doklady, dobropisy, vyúčtování, jejich kontrola, denní souhrny a hodinová analytika |
| `autoAffiliateItems` | **1 hodina** | Dotahování produktových detailů postupně až 25 dokladů na běh; TOP 10 a produkty |

Instalátor při opakovaném spuštění staré dva spouštěče nejprve odstraní, takže je neduplikuje. Google Apps Script může běh posunout, nejde o přesně určený čas. Celá historie může podle objemu dokladů a kvót Googlu trvat déle. Při první instalaci zvolte počáteční datum dostatečně daleko do historie. `TOP Hodiny life` představuje **celou dosud dostupnou a staženou historii od tohoto data**, ne nutně absolutně všechny historické objednávky.

## Listy

| List | Údaje |
|---|---|
| `Dashboard` | Přehled provizí, graf, aktuální identita partnera a stav stažení položek |
| `Souhrn` | Provize a dobropisy podle měny, kontrola vyúčtování |
| `Sync Log` | Průběh automatizací a případná upozornění |
| `Denní profit` | Denní provize (bez zbytečného doplňujícího komentáře) |
| `Doklady` | Jednotlivé provizní doklady a dobropisy |
| `Provize po dnech` | Denní agregace podle měny |
| `Polozky` | Produktové položky, sazby, částky, odkazy |
| `Polozky sync status` | Validace stažení jednotlivých dokladů; celkový průběh je na Dashboardu |
| `Produkty` | Nejvýnosnější produkty za celou staženou historii |
| `TOP Hodiny life` | **Všech 24 hodin**, čisté provize a počty dokladů ze **všech stažených dokladů**, bez závislosti na detailu produktů |
| `TOP Hodiny Měsíc` | Totéž výhradně za **předchozí úplný kalendářní měsíc** (od prvního do posledního dne) |
| `Alza vyúčtování` | Výpis a kontrola historických vyúčtování |
| `TOP10 týdny` | Produktové TOP 10 za každý ISO týden a měnu |
| `TOP10 měsíce` | Produktové TOP 10 za každý kalendářní měsíc a měnu |

Počet listů: **14**. Původní samostatný list průběhu položek se nevytváří, protože oba požadované názvy by byly identické (`Polozky sync status`); souhrnný průběh je přímo na Dashboardu a jednotlivé kontroly zůstávají v samostatném detailním listu.

## Zobrazení čísel a dat

- **Částky, ceny, sazby i provize:** `#,##0.00` podle českého locale. Například číslo `269745.5186` se zobrazí jako `269 745,52`. **Uložená hodnota se nezaokrouhluje**, pro Looker Studio se předává původní numerická hodnota.
- **Datum dokladu / denní provize / datum vyúčtování / historie od:** `dd.mm.yyyy`. Například nativní datum `2026-02-10` se ukáže jako `10.02.2026`, **nikoliv jako text**.
- **Měsíční přehled hodin:** skutečné datum prvního dne měsíce zobrazené `mm.yyyy`.
- **Počty, pořadí a hodiny:** celé číslo s oddělovači tisíců (`#,##0`). **Identifikátory** objednávek a dokladů, kódy produktů a ISO týdny zůstávají textové dimenze.
- **Výjimka:** timestampy dodané API bez explicitního časového pásma, například „Čas dokladu (zdroj)“, se ponechávají jako původní text. Stejně tak technické auditní UTC ISO timestampy. Není bezpečné jim domýšlet časovou zónu.

Při instalaci se nastaví locale Google Sheetu na **Česká republika (`cs_CZ`)** a časová zóna na **Europe/Prague**, nezávisle na měně affiliate provizí. Pro mezinárodní affiliate účty to **nijak nepřepočítává EUR, CZK nebo HUF**; měna každé částky pochází z API.

## Looker Studio (dříve Data Studio)

**Připoj konkrétní datový list jako zdroj Google Sheets**, ne vizuální Dashboard. Tabulky používají konzistentní sloupce s hlavičkou v prvním řádku, **datum jako nativní hodnotu Google Sheets**, numerické provize jako čísla a ID jako text. V Lookeru doporučuji typy polí: `Datum` → Date, `Měna` → Text, `Provize` / `Čisté provize` → Number/Currency podle kontextu, `Hodina` → Number, ID dokladů a produktů → Text.

Nejlepší výchozí zdroje: `Doklady` pro transakce, `Provize po dnech` pro trend, `Polozky` pro produkty, `TOP Hodiny life` a `TOP Hodiny Měsíc` pro časové heatmapy. Hodnota `Měsíc` v hodinovém měsíčním listu je skutečné datum prvního dne předchozího měsíce, pouze vizuálně formátované jako `YYYY-MM`. Produktové TOP 10 mají období jako text `YYYY-Www` / `YYYY-MM`.

Když se v datech vyskytuje více měn, **nevytvářej součty různých měn** bez výslovného přepočtu. Tento projekt žádný FX přepočet nedělá.

## Význam provizí a hodin

- Výše provize pochází přímo z `provision` dokumentu nebo položky. **Záporné dobropisy se odečítají.** Provize z vyúčtování se nezapočítávají podruhé.
- **Dobropis 0** je platný záznam. Pokud `documentType` odporuje znaménku nenulové částky, import **nepřerušíme**: částka zůstane s původním znaménkem a do `Sync Log` jde upozornění. Nikdy znaménko nevymýšlíme.
- `TOP Hodiny life` a `TOP Hodiny Měsíc` používají **hodinu `createdDate` provizního dokladu**. Zdroj neprokazuje, že jde přesně o čas dokončení nákupu, ani explicitně neudává časové pásmo. Hodina se proto nepřepočítává na jinou zónu.
- `TOP10 týdny` a `TOP10 měsíce` vycházejí z jednotlivých položek jen těch dokladů, kde součet položek souhlasí s provizí dokladu. Během prvotního doplňování jsou žebříčky průběžné.
- Měna provizí se bere z `currencyCode` daného dokladu, **nikoliv** z jazyka administrace nebo země produktového e-shopu. Přihlášení německého účtu může produkovat EUR.

## Bezpečnost a omezení

Heslo je v Apps Scriptu uložené do **User Properties** účtu vlastníka, nikoli ve zdrojovém kódu, Sheetu či GitHubu. Nejde o specializovaný trezor. Neposkytuj editorům přístup k projektu s uloženým affiliate účtem a zkontroluj oprávnění při první instalaci. Kontaktní údaje partnera, jako obchodní název a e-mail, se zobrazují v jeho **soukromém Dashboardu**.

Google Apps Script má limity délky běhu a počtu HTTP požadavků. Velmi dlouhá historická vyúčtování se mohou na jediný běh nevejít; v takovém případě bude potřeba další iterace s dávkováním vyúčtování. Nepublikuj obsah svého Sheetu s objednávkami jako veřejný dokument.

**iPhone Gateway** je volitelný modul se samostatným přístupovým secretem. Nasazení jako webové aplikace je jednorázový ruční krok, který instalátor Googlu nemůže automaticky potvrdit. Podrobný postup je na konci README.

## Testování

```bash
node tests/smoke.test.js
```

Testy běží offline proti syntetickým datům. Kontrolují 4h/1h triggery, e-shop měny, autentizaci, doklady, 857 stránkovaných záznamů ve vyúčtování, nulové a neobvyklé dobropisy, TOP 10, hodinovou historii a nativní datumová pole pro Looker Studio.

## PUBLIC raw tracking (od 1.0.1)
Doklady, Polozky a Produkty obsahují pět nových sloupců campaign, banner_id, bannerName, referrer, source. Ukládají surové hodnoty, které partner přenesl do interních záznamů Alza Affiliate. Žádné prefixy ani názvosloví nejsou předepsány. Chybějící hodnoty jsou prázdné. Převod object/array hodnot na JSON text je technický; případné řetězce podobné vzorci jsou v Sheets bezpečně escapované. Sloupce jsou textové dimenze pro Looker Studio.

Produkty rozlišují jeden produkt podle měny i konkrétní kombinace těchto pěti hodnot. TOP10 týdny a TOP10 měsíce se nemění a ukazují celkové produktové žebříčky bez dělení podle zdroje. Při starší instalaci se údaje doplňují postupně přes detailové dotazy (1 h / až 25 dokladů za běh).

**DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE.** Nejde o oficiální produkt ani záruku podpory ze strany Alza.cz a.s.

Licence: [LICENCE.md](LICENCE.md)

---

## iPhone Zkratky (volitelné) – instalace a notifikace

### 1. Aktivace a secret

V instalačním okně zaškrtni **„Povolit iPhone Zkratky“**. Bez zaškrtnutí se gateway nevystavuje a nepřidává se žádný časovač. Volba během instalace pouze povolí načítání souhrnů, nepublikuje webovou aplikaci.

Po dokončení instalace a první úspěšné synchronizaci v Google Sheetu otevři menu **Alza Affiliate → Připojení iPhone Zkratek**. V okně uvidíš:

- zda je gateway zapnutá, její přístupový **secret** a URL nasazené webové aplikace, pokud již existuje,
- tlačítko pro aktivaci/deaktivaci a **Vygenerovat nový secret** (okamžitě zneplatní ten starý),
- seznam klíčů JSON a ukázku notifikace.

Secret se generuje pomocí dvou náhodných UUID a ukládá pouze ve vlastních **Google Apps Script User Properties**. Nepiš jej do kódu, tabulky, GitHubu ani do URL. Drž projekt a tabulku mimo sdílený přístup editorů.

### 2. Jednorázové nasazení Apps Script Web App

1. V Apps Script klikni **Nasadit → Nové nasazení** a zvol typ **Webová aplikace**.
2. Vyber **Spustit jako: Já** (Google účet vlastnící tabulku a instalaci).
3. **Kdo má přístup: Kdokoli** (v některých rozhraních „Anyone“, včetně nepřihlášených). Přístup povol jen pokud to účet/doména umožňuje a souhlasíš s veřejně dostupnou adresou chráněnou secretem.
4. Dokonči nasazení, případně odsouhlas nové oprávnění, a zkopíruj produkční URL končící **`/exec`**. Testovací URL `/dev` není vhodná pro iPhone (obvykle vyžaduje přístup editora).
5. V Google Sheetu se vrať do **Alza Affiliate → Připojení iPhone Zkratek**; v okně zkopíruj URL a secret.

**Pozor:** Web App je přístupná na internetu, ale data vrací jen při správném dlouhém secretu v těle POST požadavku. Všechny GET požadavky i POST s chybným secretem vrací pouze chybový JSON. Obsah odpovědi pochází ze souhrnů ve tvé tabulce, nikoli z affiliate hesla. Pokud chceš gateway úplně zrušit, v menu ji vypni **a odstraň nasazení webové aplikace**. Google Apps Script ContentService používá HTTP přesměrování: Apple Zkratky musí následovat redirect.

### 3. Vytvoření Zkratky na iPhonu

V aplikaci **Zkratky → + → Nová zkratka**, např. „Alza provize“:

1. Přidej akci **URL** a vlož produkční `/exec` URL z kroku 2.
2. Přidej akci **Získat obsah URL (Get Contents of URL)**, metoda **POST**, požadované tělo **JSON**, přidej textový klíč **`secret`** s hodnotou z instalačního dialogu. Nemusíš posílat email ani heslo.
3. Ve výsledku otevři JSON slovník (případně použij akci **Získat slovník ze vstupu** / **Get Dictionary from Input** podle verze iOS).
4. Nejdřív ověř klíč **`ok`**. Pokud není `true`, zobraz chybu a nepokračuj.
5. Ze slovníku načti klíč **`notification`** a vlož ho do akce **Zobrazit oznámení (Show Notification)**. Tato proměnná už obsahuje naformátovanou čtyřřádkovou zprávu včetně měny a počtu dokladů.
6. Spusť Zkratku ručně; pokud má notifikace chodit automaticky, přidej vlastní **Osobní automatizaci** v iOS Zkratkách (například denně ve zvolený čas). Přenos JSON samotný notifikace neposílá a automatizace Apps Scriptu ani telefon samy neprobudí.

#### Výchozí oznámení (4 řádky)

```text
Celkem 9 745,52 Kč (524 Dok)
Včera 843,20 Kč (12 Dok)
Dnes 125,00 Kč (3 Dok)
Poslední sync 20:51
```

Pro **EUR/HUF** se jednotka automaticky změní z „Kč“ na kód měny. Částky jsou čisté provize ze stažených dokladů: dobropisy snižují součet a doklady s nulovou provizí se započítávají do počtu. „Včera“ a „Dnes“ používají kalendářní dny v `Europe/Prague`. Uvedené hodnoty se mění po dokončení čtyřhodinového importu provizí; hodinová synchronizace položek součty těchto dokladů nemění.

### 4. Všechny dostupné proměnné JSON

| JSON klíč | Typ | Význam |
|---|---|---|
| `ok` | boolean | Po úspěšném čtení `true`; při chybě `false` a `error` |
| `currency` | string/null | Měna provizí konkrétního účtu |
| `totalCommission` | number/null | Netto provize ze všech stažených dokladů |
| `yesterdayCommission` | number/null | Netto provize za včerejší kalendářní den |
| `todayCommission` | number/null | Netto provize za dnešní den |
| `totalDocuments` | integer/null | Počet dokladů celkem |
| `yesterdayDocuments` | integer/null | Počet včerejších dokladů |
| `todayDocuments` | integer/null | Počet dnešních dokladů |
| `lastSync` | ISO string/null | UTC timestamp dokončeného importu **dokladů** |
| `lastSyncTime` | string/null | Poslední synchronizace, hodina `HH:mm` v Praze |
| `lastClosureDate` | `YYYY-MM-DD`/null | Datum posledního **přijatého vyúčtování** dle Alza API, nikoliv datum připsání peněz |
| `daysSinceLastClosure` | integer/null | Počet kalendářních dnů od posledního přijatého vyúčtování |
| `asOfDate` | `YYYY-MM-DD` | Dnešní den v pražském časovém pásmu |
| `timezone` | string | `Europe/Prague` |
| `notification` | string/null | Hotová čtyřřádková zpráva |
| `currencies` | array | Provize a počty rozdělené podle měn (`total`, `yesterday`, `today`: každé má `commission` a `documents`) |

Příklad úspěšné odpovědi (fiktivní částky):

```json
{
  "ok": true,
  "currency": "CZK",
  "totalCommission": 269745.5186,
  "yesterdayCommission": 843.2,
  "todayCommission": 125,
  "totalDocuments": 4524,
  "yesterdayDocuments": 12,
  "todayDocuments": 3,
  "lastSync": "2026-10-20T18:51:00.000Z",
  "lastSyncTime": "20:51",
  "lastClosureDate": "2026-10-04",
  "daysSinceLastClosure": 16,
  "asOfDate": "2026-10-20",
  "timezone": "Europe/Prague",
  "notification": "Celkem 269 745,52 Kč (4 524 Dok)\nVčera 843,20 Kč (12 Dok)\nDnes 125,00 Kč (3 Dok)\nPoslední sync 20:51"
}
```

Čísla v JSON zůstávají **strojově numerická s plnou přesností**; pouze `notification` je formátovaný text. Hodnoty odpovídají **stažené historii**, ne nutně všem dokladům za dobu existence účtu.

Pokud je v archivu více měn, `currencies` obsahuje oddělené statistiky pro každou. **Globální finanční součty a `notification` budou `null`**, protože EUR a CZK nelze bezpečně sečíst. V takovém případě vytvoř vlastní notifikaci po měnách.

Vypnutí gateway v menu zabrání dalším autorizovaným načtením; regenerace secretu zneplatní původní Zkratky. Nové nasazení po změně zdrojového kódu může vyžadovat aktualizaci existujícího webového deploymentu.

Dokumentace Google: [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web) a [Content Service – přesměrování](https://developers.google.com/apps-script/guides/content).
