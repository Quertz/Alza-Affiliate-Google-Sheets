# Alza Affiliate to Google Sheets (PUBLIC v0.99)

Neoficiální, komunitní, **read-only** konektor do Google Sheets pro **Alza.cz affiliate účet na Google Sheet**. Načítá provizní doklady, dobropisy, historická vyúčtování, jednotlivé produktové položky a agregace. Nevyžaduje server, cloudové heslo u autora ani placenou databázi; vše běží pod vlastním Google účtem, data zůstávají i při přerušení načítání.

> **Nejde o oficiální ani podporované Alza API.** Používá interní webové endpointy pozorované v Alza Affiliate administraci. Alza může jejich chování kdykoliv změnit. Ověřeno lokálními integračními testy se simulovaným API; veřejnou v1.0 je nutné ještě ověřit v reálném Apps Script účtu.

## Instalace (10–15 minut)

1. Na [Google Sheets](https://sheets.google.com) vytvoř **novou prázdnou tabulku**. Neinstaluj to do tabulky se stávajícím soukromým affiliate reportingem.
2. V ní klikni **Rozšíření → Apps Script**.
3. Vlož **6 souborů `.gs`** ze složky [`src`](src) jako samostatné soubory se stejnými názvy: `Config.gs`, `Api.gs`, `Sheets.gs`, `Sync.gs`, `Items.gs`, `Setup.gs`. Výchozí `Kód.gs` smaž nebo v něm nenechávej duplicitní funkce.
4. Přidej soubor **HTML → `Setup`**, vlož obsah [`src/Setup.html`](src/Setup.html). Není to webová aplikace: HTML funguje jako instalační dialog uvnitř Google Sheets.
5. Volitelně vlož manifest [`src/appsscript.json`](src/appsscript.json) přes **Nastavení projektu → Zobrazit soubor manifestu `appsscript.json` v editoru**. Není nutný pro základní provoz.
6. Ulož projekt. V Apps Scriptu spusť funkci **`openAffiliateSetup`** (Google požádá o oprávnění k tabulce, externím HTTP požadavkům a časovačům). Nebo znovu otevři Google Sheet a použij menu **Alza Affiliate → Nastavení / instalace**.
7. V průvodci vyplň affiliate **e-mail, heslo a datum od**. Klikni **Ověřit přístup a nainstalovat**. Přihlášení se ověří přímo na `affiliate.alza.cz` a nastaví se časové spouštěče.
8. V menu **Alza Affiliate → Synchronizovat provize teď** spusť první historický import. Po jeho úspěšném dokončení spusť **Synchronizovat položky teď**. Produktové detaily se dále doplňují po dávkách.
9. V Apps Scriptu otevři **Spouštěče**. Musíš mít dva time-driven spouštěče: `autoAffiliateSync` (4 hodiny) a `autoAffiliateItems` (2 hodiny). Počítač už nemusí být zapnutý.

**Pozor:** GitHub ZIP se do Google Sheets sám nenainstaluje. Musíš nejprve vytvořit vlastní Google Apps Script projekt navázaný na Sheet a vložit soubory. Průvodce potom zajistí všechny zbývající kroky včetně uložení pověření a nastavení časovačů. Tento postup záměrně nevyžaduje zveřejnit webovou aplikaci ani posílat heslo provozovateli jiného serveru.

## Automatické spuštění

| Úloha | Interval | Co dělá |
|---|---|---|
| `autoAffiliateSync` | každé 4 hodiny | Neuzavřené doklady + historie žádostí o vyúčtování a jejich dokladů, deduplikace, souhrny a Dashboard |
| `autoAffiliateItems` | každé 2 hodiny | Nové položky až 25 dokladů/běh, kontrola součtu, produkty, hodiny, TOP 10 týdnů/měsíců |

Časovače vytváří Apps Script pod **Google uživatelem, který provedl instalaci**. Není nutné mít zapnutý prohlížeč. Jsou přibližné, neběží v přesnou minutu. Chybné doklady se znovu zkusí nejdříve za 24 hodin; nedávno vytvořené a již zkontrolované doklady se kontrolují přibližně jednou za 7 dní. Zamčené souběžné běhy se bezpečně přeskočí.

## Výstupní listy

| List | Obsah |
|---|---|
| `Dashboard` | Přehled provizí podle měny, kontrola vyúčtování, graf za poslední dostupné dny (jedna měna) |
| `Alza Souhrn` | Účet, IDP, součty kladných a záporných provizí po měnách |
| `Sync Log` | Čas, úloha, stav, stručný provozní protokol bez hesel |
| `Denní profit` | **Provizní výsledek bez nákladů**, datum a měna (nejde o čistý ekonomický zisk) |
| `Alza doklady` | Kompletní dostupná archivovaná historie jednotlivých provizních dokladů |
| `Alza denni` | Provize, dobropisy a čistý provizní výsledek po dnech |
| `Alza položky` | Produktové položky, množství, cena (`price` API), sazba, absolutní provize, klikatelný produktový odkaz |
| `Alza položky stav` | Audit počtu položek a součtu jejich provizí proti dokladu |
| `Alza produkty` | Produktové souhrny včetně dobropisů, počtů objednávek, kusů a provizí |
| `Alza hodiny` | Provize a doklady podle **hodiny vytvoření dokladu** |
| `Alza položky průběh` | Kolik dokladů je zkontrolováno, jaké chyby zbývají |
| `Alza vyúčtování` | Žádosti o vyúčtování, jejich doklady, částky a kontrola součtu |
| `TOP10 týdny` | 10 nejvýnosnějších produktů za každý ISO týden a měnu |
| `TOP10 měsíce` | 10 nejvýnosnějších produktů za každý měsíc a měnu |

## TOP 10 – jak se počítá

- `TOP10 týdny` používá týdny podle **ISO 8601** (pondělí až neděle; rok týdne se může lišit od kalendářního roku na přelomu prosince a ledna).
- `TOP10 měsíce` používá kalendářní měsíc ve formátu `YYYY-MM`.
- Za období a produkt se sčítají **položkové provize** včetně záporných dobropisů. Nevypočítáváme žebříček podle ceny produktu.
- Do žebříčku vstupují **jen doklady**, kde součet provizí položek odpovídá provizi celého dokladu (tolerance 0,05 jednotky měny).
- Jde o žebříčky jen z **dosud stažených položek**, při prvním doplňování historie jsou tedy průběžné.

## Měny a čas

Provize se zobrazují v **měně, kterou daný affiliate účet vrací v `currencyCode`**. Uživatel registrovaný přes alza.de tak může mít EUR provize i z nákupů na alza.cz; jazyk rozhraní měnu neurčuje. Výstupy různých měn se nesčítají. Žádné vlastní kurzové přepočty nejsou součástí v1.0.

Časová analytika se opírá o `createdDate` finančního dokladu. Přesné časové pásmo a zda datum odpovídá okamžiku **dokončení objednávky**, dosud nejsou nezávisle potvrzené. List proto uvádí **hodina dokladu**, nikoliv tvrzení o hodině nákupu. API `price` se zachovává v původní sémantice – není potvrzeno, zda jde o cenu za kus / bez DPH / s DPH.

## Zabezpečení

- Údaje se ukládají přes `PropertiesService.getUserProperties()` v **účtu uživatele, který instaluje a vytváří spouštěče**. Heslo se **nikdy nezapisuje do zdrojových souborů, tabulky nebo Sync Logu**.
- **Nesdílej Google Sheet ani Apps Script s editory**, kterým nedůvěřuješ. Editor skriptu může upravit kód a získat data nebo pověření při jeho spuštění pod tvým účtem. `UserProperties` není nezávislý hardwarový trezor.
- Autor tohoto repozitáře nemá přístup k přihlašovacím údajům ani k tvým datům. Komunikace probíhá pouze z tvého Apps Scriptu na `affiliate.alza.cz` a v Google infrastruktuře.

## Omezení v1.0

- Neoficiální webové API může změnit struktury bez upozornění; žádný garanční SLA.
- Import historie závisí na tom, co partnerský účet a upstream stále zpřístupňují. U starších dokladů bez dostupného vyúčtování nelze úplnost slíbit.
- Úplný detail vyúčtování může být rozdělen na desítky stránek; u velkých účtů může jednorázová synchronizace narazit na limit 6 minut Apps Scriptu. Následující běhy neobnovují neúplné stránky po jednotlivých detailech; případný limit je třeba řešit menším obdobím a další verzí.
- Google Sheets má limity kapacity a výkonu. Pro rozsáhlé účty nebo veřejnou centralizovanou službu je vhodnější databáze.
- Neimportuje reklamní náklady, nepočítá ROI ani skutečný podnikatelský zisk, ale to si můžete dopsat do dalších listů a používat odkazy mezi listy, poradíte si :-).
- Projekt slouží jedinému affiliate účtu na jednu tabulku. Pro druhý účet vytvoř druhou nezávislou tabulku.
- Tohle ReadMe psal ChatGPT, protože já jsem líný jako to prase.

## Vývoj / testy

```bash
node tests/smoke.test.js
```

Testy jsou zcela offline s anonymními simulovanými odpověďmi. Testují instalaci, 4h/2h triggery, obnovu historie, EUR měnu, dobropis, stránkování položek, ISO týdny, produktové žebříčky a opakovaný běh. Nejsou náhradou testu s reálným účtem.

## Licence a odpovědnost

WTFPL – viz [`LICENSE`](LICENSE). Název Alza je použit pouze k identifikaci cílové služby; tento projekt není oficiálním produktem společnosti Alzacz a.s.
