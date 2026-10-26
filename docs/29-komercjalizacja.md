# 29 · Komercjalizacja – analiza biznesowa i produktowa

Analiza z 26.10.2026, bez zmian w kodzie. Pytanie: czy „Trening” (web + aplikacja iOS) ma sens jako produkt komercyjny
w modelu freemium. Proponowany model: za darmo plany, cele i typy rowerów; płatne analizy AI, Dietetyk i integracja z Wahoo.
Przepływ pracy z aplikacją (etapy 0–9: od opisu siebie do następnego celu) jest w [docs/30](30-flow-produktu.md).

Oznaczenia: **[S]** – szacunek albo założenie autora, **[NZ]** – nie udało się zweryfikować, **[W]** – źródło wtórne
(agregator, blog, forum). Wszystkie źródła sprawdzone 26.10.2026. Kwoty w USD przeliczane po **3,80 zł/USD** i
**4,25 zł/EUR** [S – kursy przyjęte do rachunków, nie sprawdzane w dniu analizy].

## 0. Wniosek w skrócie

1. **Na dziś nie ma sensu zakładać na tym firmy. Ma sens tani, ograniczony test rynku.** Najpierw zamknięta beta dla
   20–50 polskich kolarzy, bez płatności, przez 6–8 tygodni. Dopiero dobre wyniki bety (§ 7) uzasadniają budowę płatności,
   wersji angielskiej i rejestrację w API.
2. **Dwie rzeczy blokują wersję komercyjną.** Żadnej nie załatwi się drobną poprawką:
   - **Polityka API Stravy z 1.06.2026 zakazuje używania danych ze Stravy w jakiejkolwiek aplikacji AI.** Dotyczy to także
     samego wklejenia ich do kontekstu modelu, nawet za zgodą użytkownika. Zakazuje też trzymania tych danych dłużej niż
     7 dni (§ 4.1). Na danych ze Stravy stoją dziś notatki trenera, czat, list tygodnia, PMC, krzywa mocy i kadencja.
     Wersja komercyjna musi brać jazdy z innych źródeł: Wahoo, plik FIT, Apple Zdrowie. **Dotyczy to także dzisiejszej
     prywatnej aplikacji** (§ 4.1, ostatni punkt).
   - **Nie istnieje generator planów dla dowolnego użytkownika.** Plany robią dwa skrypty Pythona napisane pod dwóch
     konkretnych zawodników. To właśnie miało być rdzeniem darmowej wersji. Jego budowa to największa pozycja na liście
     prac (§ 1).
3. **Ekonomia jest cienka, ale dodatnia.** Cena 34,99 zł/mies. albo 249 zł/rok daje ok. **19 zł netto od płacącego
   miesięcznie**. AI kosztuje płacącego ok. **5 zł/mies.** (Sonnet 5.5). Koszty stałe pokrywa ok. 100 płacących. Pensja
   10 tys. zł wymaga ok. 1 000–1 500 płacących, czyli 10–30 tys. zarejestrowanych kont. Na samym rynku polskim to bardzo
   ambitny cel [S].
4. **Nisza istnieje, ale jest mała.** To polskojęzyczny trener AI dla osób jeżdżących w terenie, często bez trenażera,
   z żywieniem w tej samej aplikacji. Z polskim interfejsem są intervals.icu (darmowy, bez AI-trenera) i AiTRAINER
   (szablonowy) [W]. Nikt z przejrzanych konkurentów nie łączy czatu-trenera, notatek po jeździe, zdjęć posiłków
   i wysyłki planu na komputer rowerowy.
5. **Model freemium wymaga korekty** (§ 2.4).
   - **Free:** plan z generatora, eksport treningów do plików FIT/ZWO, podsumowania jazd z reguł (już istnieją
     i nic nie kosztują), 14 dni pełnej wersji na start i jednorazowa personalizacja planu przez AI.
   - **Płatne:** plan adaptacyjny (trener przestawia dni i reaguje na zmęczenie), wszystkie funkcje AI, automatyczna
     wysyłka na Wahoo (później inne komputery).
   - Darmowy limit AI co miesiąc to zły pomysł: przy 10 tys. kont kosztowałby tyle, co AI wszystkich płacących (§ 2.5).

## 1. Luki do produktu komercyjnego

Dziś to aplikacja dla dwóch osób: rejestracja z listy `private.allowed_emails`, plan z `data/reference_generator.py`
i `data/ftp300_generator.py`, kalendarz w bundlu. Odseparowanie kont (docs/18) jest zrobione, więc baza danych jest
gotowa na wielu użytkowników. Gotowy nie jest produkt.

| Obszar | Dziś | Potrzebne do v1 | Wysiłek [S] |
|---|---|---|---|
| **Generator planów** | 2 skrypty Pythona (946 linii), offline, pod konkretne osoby; kalendarz jako JSON w bundlu | Generator w TS (silnik, bez UI), parametry: cel, data, godziny/tydz., dostępne dni, dyscyplina, poziom, FTP/LTHR; biblioteka treningów per dyscyplina; zasady R1–R16 jako dane; testy własności (np. wzrost obciążenia, rozładowania); plan liczony w aplikacji albo w Edge Function i zapisywany per konto | **10–15 dni** |
| **Dyscypliny** | szosa + gravel jako rowery; brak MTB | Szosa, gravel, MTB: inne długie jazdy (teren, czas zamiast dystansu), interwały pod podjazdy/sprint MTB, rowery i opisy; cele: FTP, wydarzenie (gran fondo, maraton MTB, ultra gravel), baza/powrót po przerwie | 3–5 dni (w ramach generatora) |
| **Onboarding** | e-mail z listy, ustawienia ręcznie | Kwestionariusz (cel, data, czas, dni, sprzęt, miernik mocy, doświadczenie), progi z testu albo z szacunku, połączenie źródła jazd, pierwszy tydzień od razu | 3–4 dni |
| **Otwarta rejestracja** | lista dozwolonych e-maili | Usunięcie listy, Turnstile/hCaptcha przy rejestracji (Supabase Auth ma to wbudowane), ograniczenia prób, Sign in with Apple (wymóg przy Google, docs/26 § 5) | 1–2 dni |
| **Płatności** | brak | StoreKit 2 w iOS (najprościej przez RevenueCat), Stripe na webie, okres próbny, odnowienia, zwroty | 4–6 dni |
| **Uprawnienia w Supabase** | brak | Tabela `entitlements` (źródło: apple/stripe/promo, `expires_at`), webhooki App Store Server Notifications v2 i Stripe → Edge Function; **sprawdzanie po stronie serwera** w `coach-chat`, `ride-note`, `meal-parse`, `email-send`, `wahoo-push` (UI tylko ukrywa przyciski) | 2–3 dni |
| **Usunięcie konta, eksport danych** | brak | `account-delete` (docs/26 § 5), eksport JSON/CSV (RODO art. 20) | 1–2 dni |
| **Prawo** | brak polityki, regulaminu, zgody na AI | Regulamin, polityka prywatności, zgoda na przekazanie danych do AI (Anthropic, Google przez OpenRouter), **dane o zdrowiu (masa, tętno, choroba) to dane szczególnej kategorii, art. 9 RODO – wymagana wyraźna zgoda**, umowy powierzenia (Supabase, Vercel, Resend, Anthropic, OpenRouter), rejestr czynności, minimalny wiek (16+), zastrzeżenie „nie porada medyczna” przy żywieniu i chorobie, ostrożność przy celach masy (ryzyko zaburzeń odżywiania) | 3–5 dni + prawnik (2–5 tys. zł [S]) |
| **Źródła jazd poza Stravą** | Strava (webhook, streamy), Wahoo tylko podsumowanie | Wahoo Cloud: pobieranie wykonanych + plik FIT; wgrywanie FIT (web, „Udostępnij” w iOS); Apple Zdrowie (iOS); ujednolicony model `rides` z metrykami z FIT (`_shared/metrics.ts` już liczy z próbek) | 5–10 dni |
| **Lokalizacja** | tylko polski (UI, maile, prompty, pomoc, `format.ts`) | i18n w `/m`, maile, prompty AI, pomoc; angielski jako drugi | 5–8 dni (odłożyć po becie) |
| **Panel administratora** | SQL Editor | Widoki SQL: użytkownicy, uprawnienia, koszt AI na konto (`ai_calls` ma tokeny), błędy funkcji; ręczne nadanie promocji; na start wystarczy Supabase + kilka widoków | 2–3 dni |
| **Wsparcie** | brak | Adres support@, FAQ w `pomoc.html`, zgłoszenie z aplikacji (z wersją i kontem) | 1 dzień |
| **Ochrona przed nadużyciami** | `ai_calls`: limit miesięczny 300, czat 80/dzień | Limity per plan (free/trial/premium), globalny limit wydatków na kluczu Anthropic i kredytach OpenRouter, alert kosztowy, limit rejestracji z IP, blokada kont jednorazowych | 1–2 dni |
| **Formalności** | konto prywatne | Działalność (JDG albo sp. z o.o.), Apple Developer jako organizacja (wymaga numeru D-U-N-S), VAT (zwolnienie podmiotowe i sprzedaż do innych krajów UE – do ustalenia z księgowym), księgowość | 1–2 tyg. czasu kalendarzowego |

**Razem: ok. 45–70 dni pracy do publicznej v1** po polsku, bez wersji angielskiej, z pomocą Claude Code [S]. Do zamkniętej
bety wystarczy część z tego: generator, onboarding, źródła jazd, prawo i usuwanie konta, czyli ok. 25–35 dni.

**Zasada generatora** taka jak w notatkach (docs/20): **kod liczy, model opowiada**. Personalizacja AI przy onboardingu
nie pisze planu. Model wybiera szablon i parametry generatora (JSON z walidacją Zod), a plan buduje deterministyczny kod
z testami. Dzięki temu plan jest powtarzalny i tani, i nie ma halucynacji w liczbach.

## 2. Koszt AI a atrakcyjność

### 2.1 Rzeczywiste zużycie (tabela `ai_calls`, 27.09–26.10.2026)

| Konto | Wywołania przy jeździe (notatka, tytuł) | Inne (czat, check-in, list) | Średnie tokeny przy jeździe (wej./wyj./odczyt cache/zapis cache) | Średnie tokeny inne |
|---|---|---|---|---|
| A (aktywny, czat od 17.10) | 40 | 31 | 1 328 / 536 / 1 798 / 1 632 | 3 535 / 767 / 892 / 765 |
| B | 27 | 4 | 1 293 / 525 / 917 / 2 194 | 6 489 / 512 / 1 551 / 1 551 |

Uwaga: zapis do cache jest prawie przy każdej notatce, bo jazdy są rzadsze niż 5-minutowe okno cache. Przy notatkach
cache nie daje oszczędności. Zysk przyniosłoby przeniesienie notatek i listu na Batch API (−50 %), bo nie muszą przyjść
w sekundę [S].

### 2.2 Koszt jednego wywołania (ceny z [cennika Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), 26.10.2026)

Ceny za 1M tokenów: Sonnet 5.5 – 2 / 10 USD (wejście/wyjście), Opus 5.5 – 4 / 20, Haiku 5.5 – 0,10 / 0,50; odczyt cache 0,05–0,1×,
zapis 5 min 1,25×. Gemini 3.8 Flash na [OpenRouter](https://openrouter.ai/api/v1/models): 0,825 / 4,125 USD. OpenRouter
pobiera **5,5 % przy zakupie kredytów** ([cennik](https://openrouter.ai/pricing)).

| Wywołanie | Sonnet 5.5 | Opus 5.5 | Haiku 5.5 | Źródło liczby tokenów |
|---|---|---|---|---|
| Notatka po jeździe albo tytuł (1 wywołanie) | 0,013 USD | 0,026 USD | 0,0006 USD | pomiar § 2.1 |
| Tura czatu / check-in | 0,017 USD | 0,034 USD | 0,0008 USD | pomiar § 2.1 (średnia mieszana) |
| List tygodnia (~10 k wej. / 2,5 k wyj.) | ~0,045 USD | ~0,09 USD | — | [S] |
| Personalizacja planu (~8 k wej. / 2 k wyj., do 3 prób) | ~0,04–0,10 USD | ~0,08–0,20 USD | — | [S] |
| Zdjęcie posiłku (Gemini 3.8 Flash) | **0,005 USD** (+5,5 % opłaty) | | | pomiar docs/25 § 6 |

**Ile miesięcznie kosztuje dziś jedno konto:** A – **1,01 USD** na Sonnet 5.5 albo 2,02 USD na Opus 5.5; B – 0,45 / 0,90 USD.
Według docs/20 notatki od 17.10 szły na `claude-opus-5-5`. Kod ma domyślnie `claude-sonnet-5`, a sekret `AI_MODEL`
decyduje – **do sprawdzenia, który model jest teraz ustawiony**. W wersji komercyjnej domyślnie Sonnet 5.5. Haiku 5.5
jest 20× tańszy, ale Haiku 4.5 mylił skale (docs/20). Przed użyciem Haiku gdziekolwiek potrzebna jest próba jakości.

### 2.3 Funkcje: koszt, częstotliwość, siła przyciągania

Częstotliwość dla typowego płacącego: 3–4 jazdy/tydz., czat kilka razy w tygodniu, posiłki 2/dzień [S]. Siła przyciągania
to ocena autora [S] – do sprawdzenia w becie.

| Funkcja | Użycie/mies. [S] | Koszt/mies. (Sonnet 5.5) | Przyciąga do płacenia | Rekomendacja |
|---|---|---|---|---|
| Notatka trenera po jeździe (+ tytuł) | 14 jazd × 2 wywołania | 0,36 USD | **wysoko** – codzienny „efekt wow” po jeździe, widać, że trener zna historię | płatne; w próbie; free dostaje podsumowanie z reguł (już istnieje, `ruleDraft`, koszt 0) |
| Czat „Zapytaj trenera” | 20 tur | 0,34 USD (intensywny: 80 tur ≈ 1,4 USD) | **wysoko** u zaangażowanych; największy zmienny koszt | płatne z limitem (dziś 80/dzień – za dużo, propozycja 30/dzień) |
| List tygodnia (mail) | 4–5 | 0,19 USD | średnio – głównie utrzymuje użytkownika | płatne; w próbie; free: 1 list na koniec miesiąca jako przypomnienie wartości (~0,05 USD) |
| Check-in jednym zdaniem | 15–20 | 0,10 USD | nisko – wygoda | płatne (tanie, ale nie sprzedaje) |
| Dietetyk (zdjęcie posiłku/etykiety) | 60 | 0,32 USD | **wysoko w segmencie odchudzających się**, nisko u reszty | płatne; w próbie; free: ręczne wpisywanie kcal bez AI |
| Personalizacja planu przy onboardingu | 1 raz | 0,04–0,10 USD jednorazowo | **wysoko** – pierwsze wrażenie | **free, jednorazowo** (inwestycja w pozyskanie) |
| Wysyłka planu na Wahoo | codziennie | ~0 (API Wahoo) | wysoko u właścicieli Wahoo, zero u reszty | płatne; free: eksport FIT/ZWO ręcznie |
| **Razem typowy płacący** | | **≈ 1,3–1,4 USD (~5 zł)** | | intensywny ≈ 3 USD → potrzebne limity |

### 2.4 Lejek: od darmowego do płatnego

1. **Onboarding:** kwestionariusz, AI personalizuje plan, pierwszy tydzień jest gotowy od razu. Zaczyna się **14 dni
   pełnej wersji**.
   - Na webie bez karty.
   - W iOS jako oferta wprowadzająca przy subskrypcji („14 dni za 0 zł”, wymaga zgody na subskrypcję). Druga droga to
     dostęp nadany przez serwer bez StoreKit [NZ – zgodność z wytycznymi 3.1.1 do potwierdzenia].
2. **W trakcie próby** użytkownik dostaje notatkę po każdej jeździe, list w niedzielę, Dietetyka i automatyczną wysyłkę
   na Wahoo. Po 14 dniach wie, co traci.
3. **Po próbie (free):**
   - plan dalej działa;
   - podsumowanie jazdy z reguł, z jedną linijką „Trener napisałby więcej – Trener Premium”;
   - raz w miesiącu list AI „Twój miesiąc”;
   - eksport FIT/ZWO przy treningu.
4. **Momenty sprzedaży**, czyli kontekst, w którym brak funkcji boli:
   - pierwszy przegapiony trening (plan adaptacyjny proponuje przestawienie);
   - test FTP (AI omawia wynik);
   - zdjęcie posiłku;
   - 4 tygodnie przed wydarzeniem.
5. **Bez stałego darmowego limitu AI co miesiąc.** Rachunek w § 2.5: przy 10 tys. kont limit „3 notatki + 5 tur czatu +
   5 posiłków” (~0,2 USD na aktywnego darmowego) kosztowałby ok. 800 USD/mies. To prawie tyle, ile AI wszystkich płacących.

### 2.5 Miesięczny koszt AI dla 100 / 1 000 / 10 000 kont [S]

Założenia:
- 40 % zarejestrowanych aktywnych w miesiącu;
- 5 % płacących;
- 15 % nowych kont miesięcznie, każde z próbą 14 dni (~0,7 USD) i personalizacją (~0,1 USD);
- aktywny darmowy: 0,03 USD (list miesięczny);
- płacący: 1,4 USD (Sonnet 5.5).

| Konta | Płacący | AI płacących | AI próby + onboarding | AI darmowych | **Razem AI/mies.** | Na Opus 5.5 (×~1,9) |
|---|---|---|---|---|---|---|
| 100 | 5 | 7 USD | 12 USD | 1 USD | **≈ 20 USD (76 zł)** | ≈ 38 USD |
| 1 000 | 50 | 70 USD | 120 USD | 8 USD | **≈ 200 USD (750 zł)** | ≈ 380 USD |
| 10 000 | 500 | 700 USD | 1 200 USD | 80 USD | **≈ 2 000 USD (7 500 zł)** | ≈ 3 800 USD |

Wniosek: przy wzroście **najdroższa jest próba**, nie płacący. Około 3 zł na nowe konto to i tak tanie pozyskanie
w porównaniu z reklamą. Próbę można skrócić do 7 dni albo dać ją dopiero po połączeniu źródła jazd (odpadają konta
porzucone po rejestracji). Model musi być Sonnet, nie Opus – różnica to ~2× kosztu AI.

## 3. Strava a chmury komputerów rowerowych

### 3.1 Gdzie dziś zależymy od Stravy
- **Import jazd:** webhook, streamy, `strava_activities`, `strava_streams`, uzupełnianie historii do 400 dni.
- **Wszystko, co z tego liczymy:** TSS/IF, PMC, krzywa mocy, propozycja FTP, kadencja, plan vs wykonanie, raporty.
- **AI:** notatki trenera, tytuły i opisy zapisywane na Stravie, kontekst czatu (jazdy z 14 dni), list tygodnia, maile
  po treningu.
- **Logowanie przez Stravę** (docs/28).

### 3.2 Co umożliwia każda usługa (stan 26.10.2026)

| Usługa | Wysyłka planu na urządzenie | Pobieranie wykonanych | Dostęp | Źródło |
|---|---|---|---|---|
| **Strava** | nie | tak, ale: **zakaz AI, cache ≤ 7 dni** | 1 osoba → 10 samodzielnie → powyżej review | [API Policy](https://www.strava.com/legal/api_policy), [limity](https://developers.strava.com/docs/rate-limits/) |
| **Wahoo Cloud** | **tak** (`plan.json`, dni od dziś do +6) | tak (podsumowanie + plik FIT), **tylko jazdy nagrane na sprzęcie Wahoo** | sandbox od razu, produkcja po review | [cloud-api.wahooligan.com](https://cloud-api.wahooligan.com/) |
| **Garmin Connect** (Training API, Activity API) | tak | tak | tylko firmy; **przyjmowanie nowych wniosków wstrzymane od wiosny 2026, bez terminu** | [the5krunner, 14.09.2026](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/) [W] |
| **Hammerhead Karoo** | publiczne API nieznalezione; partnerzy (JOIN, TrainingPeaks) mają | nie publicznie | [NZ] | [Tredict](https://www.tredict.com/blog/hammerhead_api_integration/) [W] |
| **COROS** | tak (Partner API) | tak (webhook) | zarejestrowana firma z bazą użytkowników | [COROS support](https://support.coros.com/hc/en-us/articles/360040256531) [W] |
| **Suunto** | tak („Guides”, partnerzy) | tak | program partnerski API Zone [NZ szczegóły] | [apizone.suunto.com](https://apizone.suunto.com/) |
| **Polar AccessLink** | **nie** | tak | samodzielnie (klient w panelu) | [AccessLink](https://www.polar.com/accesslink-api/) |
| **intervals.icu** | tak (wydarzenia/treningi; sam wysyła na Garmin Connect na 7 dni) | tak | OAuth po mailu do autora albo klucz osobisty użytkownika | [API](https://intervals.icu/api-docs.html), [integracje](https://www.intervals.icu/integrations/) |
| **TrainingPeaks** | tak | tak | tylko zatwierdzeni partnerzy; od 22.07.2026 własność Garmina | [TP blog](https://www.trainingpeaks.com/blog/an-update-on-trainingpeaks-partner-api/), [Garmin](https://www.garmin.com/en-US/newsroom/press-release/corporate/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/) |
| **Apple Zdrowie** (iOS) | — | treningi, tętno, moc na rowerze [NZ: czy Wahoo/Garmin zapisują tam moc] | uprawnienie HealthKit, bez umowy | docs/27 § 2 |
| **Plik FIT/ZWO** (bez API) | Hammerhead przyjmuje ZWO i FIT przez Dashboard; Garmin Edge – FIT przez USB (różnie wg forum); Wahoo – import pliku [NZ] | wgranie pliku `.fit` z jazdy (każdy komputer) | brak | [Hammerhead](https://support.hammerhead.io/hc/en-us/articles/4416694669851) |

### 3.3 Rekomendacja
- **Rdzeń danych bez Stravy.** Model `rides` budowany z czterech źródeł:
  - Wahoo Cloud (jazdy z ELEMNT + FIT);
  - wgrany plik FIT;
  - Apple Zdrowie;
  - Polar AccessLink.

  Metryki liczy `_shared/metrics.ts` z próbek FIT. Ten sam kod, który dziś liczy je ze streamów.
- **Garmin**, największy udział wśród komputerów rowerowych [S], jest dziś niedostępny. Do czasu otwarcia programu
  zostają:
  - eksport FIT (Edge przez USB);
  - pliki FIT z Garmin Connect wgrywane ręcznie;
  - most przez intervals.icu kluczem użytkownika [NZ: regulamin intervals.icu dla aplikacji komercyjnych; dane, które
    intervals.icu pobrał ze Stravy, podlegają ograniczeniom Stravy].
- **Strava zostaje tylko do logowania** i jako opcjonalny import do widoków bez AI, z kasowaniem po 7 dniach. W praktyce
  dla analiz długoterminowych jest bezużyteczna. Zapis tytułów i opisów AI na Stravę w wersji komercyjnej wyłączyć.
- **Wahoo: automatyczna wysyłka** (płatne) **+ eksport FIT/ZWO dla wszystkich** (darmowe). Eksport obsługuje Garmina
  i Hammerheada bez żadnych umów.

## 4. Limity i rejestracja w usługach

### 4.1 Strava – największe ryzyko projektu
- **Limity:** domyślnie 200 zapytań/15 min i 2 000/dzień, odczyt 100/15 min i 1 000/dzień
  ([rate limits](https://developers.strava.com/docs/rate-limits/)).
- **Liczba użytkowników:** nowa aplikacja obsługuje 1 sportowca. Samodzielnie można podnieść do 10, powyżej trzeba
  przejść review. Standard Tier to do 9 999 osób, Extended od 10 000
  ([FAQ](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906)).
  - Review nie ma SLA. Zgłoszenie z 1.10.2026 było bez odpowiedzi 15.10 [W]
    ([appsforstrava](https://appsforstrava.com/blog/strava-developer-program-changes-2026)).
  - Wymagane są wytyczne marki i przycisk „Connect with Strava”.
- **Polityka API z 1.06.2026** ([api_policy](https://www.strava.com/legal/api_policy)):
  - § 5.3 zakazuje użycia danych Stravy przy „development, training, evaluation, or operation of any AI Application”,
    także danych pochodnych i „ingestion into a context window”;
  - § 5.10 zakazuje przekazywania danych dostawcom AI „even if a user … consents”;
  - § 5.16 zakazuje własnych serwerów MCP;
  - § 6.2 dopuszcza cache najwyżej 7 dni;
  - § 3.3: w Standard Tier deweloper albo wskazani użytkownicy muszą mieć subskrypcję Stravy.

  Jedyny dozwolony kanał AI to MCP Stravy, do osobistego użytku subskrybenta. FAQ Stravy mówi wprost, że aplikacje
  przekazujące dane do zewnętrznej AI nie dostaną wyższego limitu.
- **Wniosek:** z notatkami AI na danych Stravy review nie przejdzie, a wersja komercyjna nie wyjdzie poza 10 osób.
  Notatki, czat i list muszą korzystać z danych z innych źródeł (§ 3.3). Interpretację § 6.2 (czy „cache” obejmuje
  przechowywanie w bazie) warto potwierdzić u prawnika albo mailem do developers@strava.com.
- **Dotyczy to już dzisiejszej aplikacji.** Prywatna aplikacja dla dwóch osób też korzysta z API Stravy i podlega tej
  polityce. Ryzyko: odebranie klucza API. Decyzja należy do użytkownika (§ 7.3).

### 4.2 Wahoo
- **Limity:** sandbox 25 zapytań/5 min, 100/h, 250/dzień. Produkcja 200/5 min, 1 000/h, 5 000/dzień; wyższe przez support.
  Autoryzacja, odświeżanie tokenu i pobieranie plików się nie liczą ([dokumentacja](https://cloud-api.wahooligan.com/)).
- **Pojemność:**
  - przy 2 zapytaniach na dzień na osobę sandbox wystarcza na ok. 100 aktywnych osób;
  - produkcja wystarcza na ok. 2 000 osób przed prośbą o podniesienie limitu [S].
- **Do zrobienia:** zgłosić aplikację do produkcji przed betą większą niż ~50 osób. Kryteria i czas review: [NZ].
  Ryzyko średnie.

### 4.3 Garmin, COROS, Suunto, Polar, intervals.icu
- **Garmin:**
  - wniosek tylko dla firm;
  - wstrzymany od wiosny 2026 („significant redesign”), bez terminu ([the5krunner](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/) [W]);
  - zapisać się na listę po wznowieniu;
  - do tego czasu tylko pliki.
- **COROS:** wymaga firmy i bazy użytkowników, wniosek na api@coros.com. Sensowny dopiero po becie.
- **Suunto:** program partnerski [NZ czas].
- **Polar:** samodzielny dostęp, tylko odczyt. Najtańsza integracja do dodania.
- **intervals.icu:** OAuth po mailu do autora. Zależność od jednej osoby.

### 4.4 Pozostałe rejestracje
- **Apple Developer Program:** 99 USD/rok ([Apple](https://developer.apple.com/programs/whats-included/)). Jako
  organizacja potrzebny jest D-U-N-S, co zajmuje kilka dni do 2 tygodni [S].
- **Small Business Program (15 %):** osobny wniosek.
- **Sign in with Apple:** obowiązkowy przy logowaniu Google.
- **Google OAuth:** ekran zgody z marką aplikacji. Weryfikacja przy podstawowych zakresach (e-mail, profil) jest lekka [NZ].
- **Resend:** domena już zweryfikowana. Od ~100 maili dziennie potrzebny płatny plan (darmowy ma limit 100/dzień)
  ([cennik](https://resend.com/pricing)).

## 5. Rynek i konkurencja

### 5.1 Konkurenci (ceny z 26.10.2026; większość ze stron producentów, część [W])

| Produkt | Cena mies. / rok | Darmowa wersja | Pozycja i AI | Wysyłka na komputer | Polski |
|---|---|---|---|---|---|
| [TrainerRoad](https://www.trainerroad.com/pricing) | 21,99 / 209,99 USD | nie (30 dni zwrotu) | plany adaptacyjne, „TrainerRoad AI” (FTP, zmęczenie) od 01.2026 [W] | Garmin, Wahoo (pull 3 dni) | nie [NZ] |
| TrainingPeaks | Premium 19,95 USD / 134,99 USD [W] | Basic | platforma trenerów i gotowych planów; od 07.2026 Garmin | Garmin (głęboko), inne | interfejs [NZ]; polskie plany w sklepie |
| [Zwift](https://www.zwift.com/news/33635-how-much-does-zwift-cost-and-whats-included-everything-you-need-to-know) | 19,99 / 199,99 EUR | 14 dni | świat wirtualny, trenażer | — | [NZ] |
| Wahoo App (SYSTM) | Core 4,99 / Pro 17,99 USD; Base free (od 12.08.2026) [W] | tak | plany, rekomendacje dnia w Pro | własny ekosystem | [NZ] |
| [JOIN](https://join.cc/pricing) | 16,99 / 119,99 EUR | 7 dni | plan adaptacyjny wg RPE i dostępności | Garmin, Wahoo, Hammerhead, Zwift | nie (DE/NL/FR) [NZ] |
| Xert | 14,99 / 99,95 USD [W] | 30 dni | model „Fitness Signature”, tylko rower | Garmin, Wahoo, Hammerhead [NZ] | [NZ] |
| [intervals.icu](https://intervals.icu/) | darmowy; wsparcie 4 USD | **pełna analiza za darmo** | analityka bez AI; nakładki AI firm trzecich (np. LeCoach 24,99 USD) | Garmin, Wahoo, Polar, Coros, Suunto, Zwift | **tak** |
| Humango | 16,99 / 155,99 USD; Premium 28,99 USD [W] | 14 dni | **czat-trener „Hugo”**, adaptacja | Garmin, Wahoo, Zwift | [NZ] |
| RestOrTrain | 14,99 / 134,99 USD [W] | kilka pytań/mies. | czat LLM, ocena jazd | Garmin, Wahoo, Hammerhead, Coros | [NZ] |
| TrainerDay | 4,99 USD [W] | 3 wysyłki/mies. | „AI Plan Builder”, trenażer | [NZ] | [NZ] |
| [Strava](https://www.strava.com/pricing?hl=pl-PL) | **19,99 / 149,99 zł** | tak | Athlete Intelligence (podsumowania AI), Runna (bieganie) | — | **tak** |
| Garmin Connect+ / Garmin Coach | 8,99 / 89,99 EUR; Coach darmowy | tak | Active Intelligence; plany tylko na urządzeniach Garmin | tylko Garmin | **tak** |
| AiTRAINER (aitrainer.eu) | 79 zł promocyjnie / 149 zł (okres rozliczenia niejasny) [W] | 14 dni | **polski**, szosa/MTB/gravel/CX, wg opinii szablonowy | [NZ] | **tak** |

### 5.2 Luki u konkurencji (szanse)
- **Nikt nie łączy wszystkich czterech funkcji:** polski czat-trener, notatka po każdej jeździe, zdjęcia posiłków
  z budżetem kalorii i automatyczna wysyłka na komputer. Analizy posiłków ze zdjęć nie znaleziono u żadnego konkurenta
  [NZ, że nie istnieje].
- **Konkurenci są nastawieni na trenażer.** TrainerRoad, Zwift, SYSTM i TrainerDay żyją z jazd w ERG. Osoby jeżdżące
  na zewnątrz, na tętno, bez miernika mocy (jak Z2 na tętno w tym projekcie) są obsłużone słabo. Wyjątki to JOIN
  i Garmin Coach.
- **Przejęcie TrainingPeaks przez Garmina (07.2026)** i wstrzymany program API Garmina zamykają ekosystem. Niezależne
  narzędzia z Wahoo i FIT mają przez to trochę miejsca.

### 5.3 Zagrożenia rynkowe
- **Strava ma polski cennik, 149,99 zł/rok i własne AI.** To ona ustawia oczekiwania cenowe w Polsce.
- **intervals.icu daje analizę za darmo** i ma polski interfejs. Płatna musi być wartość trenera, nie wykresy.
- **Garmin Coach jest darmowy** dla posiadaczy Garminów, czyli dużej części docelowej grupy [S].
- **Duzi gracze dodają AI szybciej**, niż jedna osoba zbuduje generator planów.

### 5.4 Wielkość rynku (szacunki)
- **Strava:** ponad 180 mln kont, ok. 50 mln aktywnych miesięcznie [W]
  ([pracasport](https://pracasport.pl/raport-roczny-strava-2025),
  [the5krunner](https://the5krunner.com/2026/01/09/strava-ipo-filing-3-billion-valuation-analysis/)).
- **Płacący u konkurentów:** TrainerRoad 150–350 tys., Zwift 0,7–0,95 mln (szacunek DC Rainmaker z 2022) [W].
- **Raporty o rynku aplikacji treningowych** podają ok. 1,2 mld USD w 2025 r.
  ([marketintelo](https://marketintelo.com/report/cycling-training-app-market)). Definicje są rozbieżne, liczby tylko
  orientacyjne.
- **Polska:** wg [CBOS](https://cbos.pl/EN/publications/reports/open_file.php?id=4674) ok. 22 % dorosłych jeździ na rowerze
  regularnie. Liczby kolarzy treningowych nie ma w żadnym źródle [NZ]. Szacunek autora metodą Fermiego:
  - **100–300 tys.** osób z komputerem rowerowym albo zegarkiem, które trenują pod cel;
  - 5–10 % z nich płaci za aplikację treningową, czyli **5–30 tys.**;
  - realny udział nowej marki po 2–3 latach to 3–5 % z tego, czyli **150–1 500 płacących** [S].
- **UE i świat** wymagają wersji angielskiej i walki o uwagę z firmami, które wydają na marketing więcej, niż ten projekt
  zarobi. Szansą jest tylko wąska nisza, np. „trener AI z żywieniem dla jeżdżących na zewnątrz”, i treści (SEO, YouTube).

### 5.5 Czy to ma sens komercyjnie?
**Jako źródło utrzymania – raczej nie.** Górna granica dla Polski to ok. 1 500 płacących, czyli ~28 tys. zł netto
miesięcznie przed podatkiem i kosztami. To optymistyczny wynik, wymagający marketingu, którego plan nie zakłada [S].
**Jako dochodowy projekt poboczny, który pokrywa własne koszty i daje kilka tysięcy złotych – tak, możliwe.** Pod
warunkiem że:
- generator planów jest dobry;
- dane jazd nie zależą od Stravy;
- ktoś poświęca czas na wsparcie i marketing.

Najmocniejszy argument za: produkt już działa i jest używany codziennie. Ma rzadką kombinację funkcji, a koszt krańcowy
AI (~5 zł na płacącego) jest niski wobec ceny.

## 6. Ceny

### 6.1 Abonament czy jednorazowa opłata
- **Abonament** jest konieczny dla funkcji AI. Koszt rośnie z użyciem, a jednorazowa opłata go nie pokryje.
- **Jednorazowo** można sprzedawać **plan na wydarzenie** (np. 12 tygodni do maratonu MTB za 79–99 zł, z notatkami AI
  tylko w tym czasie) [S]. To dobra oferta dla osób, które nie chcą abonamentu. Podobnie działa sklep planów
  TrainingPeaks.

### 6.2 Proponowane progi [S]
| Plan | Cena | Uwagi |
|---|---|---|
| **Free** | 0 zł | plan z generatora (statyczny, bez adaptacji), cele, dyscypliny, eksport FIT/ZWO, ręczne logi, podsumowanie z reguł, jednorazowa personalizacja AI, 14 dni Premium na start |
| **Premium „Trener”** | **34,99 zł/mies. albo 249 zł/rok** (≈ 20,75 zł/mies.) | wszystko AI (limity: czat 30 tur/dzień, posiłki 10/dzień), plan adaptacyjny, wysyłka na Wahoo, maile, list tygodnia |
| Plan na wydarzenie (opcja) | 79–99 zł jednorazowo | 8–16 tygodni Premium związane z datą wydarzenia |

Dla porównania: Strava 149,99 zł/rok, JOIN 119,99 EUR (≈ 510 zł), TrainerRoad 209,99 USD (≈ 800 zł). Cena 249 zł/rok jest
pośrodku. Wyżej niż Strava, bo to trener, a nie dziennik. Wyraźnie niżej niż zagraniczne aplikacje.

### 6.3 Ile zostaje z ceny
- **VAT 23 %** jest w cenie.
- **Apple w Small Business Program bierze 15 %** od ceny netto ([Apple](https://developer.apple.com/app-store/small-business-program/)).
  Apple jest sprzedawcą i rozlicza VAT [NZ].
- **Stripe w Polsce:** 1,5 % + 1 zł za kartę z EOG, Billing 0,7 % ([Stripe](https://stripe.com/en-pl/pricing)).
- **Paddle i Lemon Squeezy** (rozliczają VAT za sprzedawcę) biorą 5 % + 0,50 USD. Przy cenie ~35 zł to ok. 10 %.
  Stripe jest tańszy, dopóki sprzedaż zagraniczna w UE nie przekracza 10 tys. EUR rocznie
  ([próg OSS](https://www.fonoa.com/countries/poland/tax-on-digital-services)).
- **RevenueCat** jest darmowy do 2 500 USD przychodu miesięcznie ([cennik](https://www.revenuecat.com/pricing/)).

| Cena (mies. / rok) | Netto z płacącego / mies. (60 % rocznych, 70 % przez App Store) [S] |
|---|---|
| 29,99 / 199,99 zł | 15,7 zł |
| **34,99 / 249 zł** | **18,9 zł** |
| 44,99 / 329 zł | 24,7 zł |

Linki do płatności webowych w aplikacji iOS: w USA Apple od 2025 r. nie może zakazywać linków. Wysokość opłaty ustala
sąd [W] ([Fenwick](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple)).
W UE od 1.10.2026 obowiązują nowe warunki DMA [W, NZ w dokumentach Apple]. **Na v1 wystarczą:** zakup w aplikacji na iOS,
Stripe na webie i jedno konto z uprawnieniami ważnymi na obu platformach. Apple pozwala korzystać na iOS z dostępu
kupionego na webie (wytyczna 3.1.3(b)), ale w aplikacji nie wolno reklamować tańszej ceny z webu.

### 6.4 Koszty stałe (miesięcznie) [ceny z [Supabase](https://supabase.com/pricing), [Vercel](https://vercel.com/pricing), [Resend](https://resend.com/pricing)]

| Pozycja | 100 kont | 1 000 kont | 10 000 kont |
|---|---|---|---|
| Supabase Pro (100 tys. MAU w cenie; przy 10 tys. mocniejsza instancja [S]) | 25 USD | 25–50 USD | ~150 USD [S] |
| Vercel Pro (Hobby nie pozwala na użytek komercyjny) | 20 USD | 20 USD | ~40 USD [S] |
| Resend (maile poranne i po treningu ~25/konto/mies. [S]) | 20 USD (limit 100/dzień w Free) | 20 USD | ~200 USD [S] |
| Apple Developer (99 USD/rok) | 8 USD | 8 USD | 8 USD |
| Księgowość | 400 zł [S] | 400 zł | 400 zł |
| **Razem bez AI** | **≈ 690 zł** | **≈ 840 zł** | **≈ 2 030 zł** |

Jednorazowo: prawnik 2–5 tys. zł, ewentualnie założenie spółki [S].

### 6.5 Scenariusze miesięczne (cena 34,99 / 249 zł, AI na Sonnet 5.5, przed podatkiem dochodowym, bez wartości własnego czasu) [S]

| Konta | Konwersja | Płacący | Przychód netto | AI + infrastruktura + księgowość | **Wynik** |
|---|---|---|---|---|---|
| 100 | 5 % | 5 | 95 zł | 760 zł | **−670 zł** |
| 1 000 | 3 % | 30 | 570 zł | 1 490 zł | **−920 zł** |
| 1 000 | 5 % | 50 | 950 zł | 1 590 zł | **−640 zł** |
| 1 000 | 10 % | 100 | 1 890 zł | 1 850 zł | **≈ 0** |
| 10 000 | 3 % | 300 | 5 680 zł | 8 530 zł | **−2 840 zł** |
| 10 000 | 5 % | 500 | 9 470 zł | 9 570 zł | **≈ 0** |
| 10 000 | 10 % | 1 000 | 18 940 zł | 12 170 zł | **+6 770 zł** |

Scenariusze zakładają ciągły wzrost (15 % nowych kont miesięcznie z próbą AI). Bez wzrostu, przy 10 000 kont i 5 %,
wynik wynosi ok. **+4 400 zł**, bo znika koszt prób.

- **Próg rentowności:** ok. 100 płacących przy niewielkim wzroście.
- **Typowa konwersja freemium w aplikacjach fitness:** 2–5 % [S, NZ].
- **Wniosek:** potrzebna jest konwersja ≥ 5 % i dziesiątki tysięcy kont.

## 7. Rekomendacja i plan

### 7.1 Decyzja: warunkowe „tak” na walidację, „nie” na budowę firmy przed walidacją

### 7.2 Kolejność prac [S – dni pracy z Claude Code]

| # | Etap | Zakres | Wysiłek |
|---|---|---|---|
| 0 | **Zgodność ze Stravą** (ważne też bez komercjalizacji) | Decyzja wg § 7.3 pkt 1. Technicznie: źródło jazd dla AI z Wahoo/FIT (patrz 2) | — |
| 1 | **Generator planów w TS + dyscypliny** | szablony celów (FTP, wydarzenie, baza, powrót), szosa/gravel/MTB, R1–R16 jako dane, testy; obecne dwa programy jako przypadki testowe | 10–15 dni |
| 2 | **Źródła jazd bez Stravy** | Wahoo (wykonane + FIT), wgrywanie FIT, Apple Zdrowie, Polar; metryki z FIT; eksport FIT/ZWO planu | 5–10 dni |
| 3 | **Onboarding + personalizacja AI** | kwestionariusz → parametry generatora (model wybiera, kod buduje), progi z szacunku | 3–4 dni |
| 4 | **Wymogi App Store i prawo** | docs/26 § 5 (usuwanie konta, polityka, zgoda na AI i dane zdrowotne, Sign in with Apple, konto demo), regulamin, prawnik | 4–6 dni + prawnik |
| 5 | **Zamknięta beta** | 20–50 osób (TestFlight + web), bez płatności, otwarta rejestracja z kodem zaproszenia; Strava ≤ 10 osób tylko do logowania; Wahoo do produkcji | 6–8 tyg. kalendarzowo |
| — | **Bramka decyzyjna** | retencja po 4 tygodniach ≥ 40 %; ≥ 50 % aktywnych używa AI co tydzień; ≥ 30 % deklaruje zakup za 249 zł/rok albo wpłaca przedpłatę (np. 99 zł za pierwszy rok dla bety) [S] | — |
| 6 | **Płatności i uprawnienia** | RevenueCat + StoreKit 2, Stripe, `entitlements`, sprawdzanie w Edge Functions, limity per plan, alert kosztów | 6–9 dni |
| 7 | **Formalności i start w PL** | działalność, D-U-N-S, Small Business Program, publikacja w App Store, strona produktu | 1–2 tyg. kalendarzowo |
| 8 | **Później** | angielski (5–8 dni), Garmin po wznowieniu programu, COROS/Suunto, Android (Capacitor) | — |

**Do bety: ok. 25–35 dni pracy. Do publicznej v1 po polsku: ok. 45–70 dni** [S].

### 7.3 Decyzje użytkownika
1. **Strava a obecna aplikacja.** Możliwości:
   - (a) zapytać Stravę (developers@strava.com), czy notatki dla samego sportowca są dozwolone;
   - (b) przełączyć notatki AI na dane z Wahoo i wyłączyć zapis tytułów na Stravę;
   - (c) zostawić jak jest i świadomie przyjąć ryzyko odebrania klucza.
2. **Czy w ogóle walidować rynek.** To 25–35 dni pracy do bety, kosztem dalszego rozwoju aplikacji pod własny trening.
3. **Zakres darmowej wersji.** Plan statyczny za darmo, a adaptacja płatna (rekomendacja), czy pełny plan adaptacyjny
   za darmo, jak zakłada pierwotny model.
4. **Cena:** 34,99 zł/249 zł (rekomendacja), 29,99/199,99 zł czy 44,99/329 zł. Do tego: czy sprzedawać „plan na wydarzenie”.
5. **Model AI:** Sonnet 5.5 dla wszystkich (rekomendacja) czy Opus 5.5 dla płacących (~2× kosztu AI). Czy testować
   Haiku 5.5 dla tańszych zadań (check-in, tytuły).
6. **Forma prawna:** JDG czy sp. z o.o. (odpowiedzialność za dane zdrowotne przemawia za spółką [S]). Do tego Stripe
   (VAT samodzielnie) czy Paddle (wygoda, ok. 10 % ceny).
7. **Marka i nazwa:** „Trening” jest zbyt ogólna dla App Store i SEO (docs/26 § 9 pkt 4). Przed publicznym startem
   potrzebna jest nazwa własna.

### 7.4 Największe ryzyka
1. **Polityka API Stravy.** Zakaz AI i cache do 7 dni podcinają dzisiejszą architekturę. Review może się ciągnąć
   bez terminu.
2. **Generator planów.** Jakość planu dla obcych ludzi bez trenera w pętli. Zły plan to zwroty, złe opinie i ryzyko
   kontuzji (odpowiedzialność, zastrzeżenia, prawnik).
3. **Zamknięty Garmin.** Najpopularniejszy ekosystem jest dziś dostępny tylko przez pliki. Wahoo to mniejszość rynku [S].
4. **Mały rynek i silna konkurencja.** Strava 149,99 zł/rok, darmowe intervals.icu i Garmin Coach. W Polsce jest
   miejsce najwyżej na ~1 500 płacących [S].
5. **Czas jednej osoby.** Wsparcie, RODO, App Store, recenzje i marketing zjedzą czas, który dziś idzie na rozwój
   i własny trening.
6. **Koszt AI przy nadużyciach.** Bez limitów po stronie serwera jedno konto może wygenerować koszty rzędu dziesiątek
   USD dziennie. Potrzebne są limity per plan i globalny limit wydatków.
