# 01 · Zasady treningu: strefy, testy i reguły adaptacji

Ten dokument definiuje **jak liczyć intensywność** i **jak aplikacja ma reagować**, gdy życie nie idzie zgodnie z planem. Reguły mają identyfikatory (R1…R16) – używaj ich w kodzie silnika i w testach.

## 1. Strefy tętna (z LTHR)

LTHR (lactate threshold heart rate) = tętno progowe z testu (sekcja 2). Strefy jako ułamek LTHR (model Friela, uproszczony do potrzeb planu):

| ID | Nazwa | % LTHR | RPE (1–10) | Jak to czuć | Przykład dla LTHR 160 |
|---|---|---|---|---|---|
| Z1 | Regeneracja | < 81% | 1–2 | bardzo luźno | < 130 |
| Z2 | Wytrzymałość (baza) | 81–89% | 3–4 | rozmowa pełnymi zdaniami | 130–142 |
| Z3 | Tempo | 90–93% | 5–6 | krótkie zdania | 144–149 |
| SS | Sweet spot | 92–96% | 6–7 | mocno, ale kontrolowanie | 147–154 |
| Z4 | Podprogowa | 94–99% | 7–8 | pojedyncze słowa | 150–158 |
| THR | Progowa (interwały) | 95–100% | 7–8 | na granicy | 152–160 |
| Z5a | Nadprogowa | 100–102% | 8–9 | — | 160–163 |
| Z5b | VO2max | 103–106% | 9 | tętno dochodzi dopiero pod koniec powtórzeń | 165–170 |
| Z5c | Beztlenowa | > 106% | 10 | sprint | > 170 |

Zasady wyświetlania:
- Aplikacja pokazuje **zakres w bpm** (zaokrąglony do całości) + RPE + kadencję.
- **Opóźnienie tętna:** w interwałach ≥ SS pierwsze 2–3 minuty prowadzone są po RPE. Komunikat w UI przy każdym interwale.
- **Dryf w upale:** przy temperaturze > 28 °C cele tętna dla Z2–SS obniż o 3–5 bpm (R13).
- Strefy mocy (na przyszłość, gdy pojawi się miernik): Z1 < 55% FTP, Z2 56–75%, Z3 76–90%, SS 88–94%, Z4 91–105%, Z5 106–120%, Z6 121–150%.
- W `data/program.json` → `hr_zones_lthr_fraction` i `power_zones_ftp_fraction`.

## 2. Testy

| Test | Kiedy | Protokół | Wynik |
|---|---|---|---|
| **TEST_LTHR** (terenowy, domyślny) | tydz. 1, 7, 29, 37, 45 (środa) | 15 min rozgrzewki (z 2×20 s przyspieszeniami), 5 min luźno, **30 min maksymalnego równego wysiłku w pojedynkę**, 10 min schłodzenia. Zawsze ta sama trasa (płasko lub równy lekki podjazd), bez jazdy w grupie. Pierwsze 5 min nie za mocno. | **LTHR = średnie tętno z minut 10–30.** Zapisz też: prędkość średnią, dystans, rower, temperaturę, wiatr. |
| **WATTBIKE_TEST** (zima) | tydz. 16 (środa) i 24 (wtorek) | 15 min rozgrzewki, 5 min luźno, **20 min all-out** na Wattbike, 10 min schłodzenia | **FTP = 0,95 × średnia moc**, **LTHR ≈ 0,97 × średnie tętno z 20 min** |

Po każdym teście:
1. Aplikacja zapisuje wynik, przelicza strefy (R11) i przypomina o **ustawieniu nowych stref tętna w aplikacji ELEMNT** (jeśli nie ma integracji).
2. Pokazuje trend: LTHR, prędkość średnią na trasie testowej, FTP (Wattbike), W/kg = FTP ÷ aktualna masa (średnia 7-dniowa).
3. Przelicza szacowany czas podjazdu 8 km / 8,8% (kalkulator z `00-kontekst-i-decyzje.md`).

**Uwaga o tętnie maksymalnym:** plan nie wymaga HRmax. Jeśli użytkownik je poda, reguła „max 85% HRmax” w powtórzeniach podjazdu jest pokazywana dodatkowo; domyślnie używamy 94–99% LTHR.

## 3. Siłownia: RIR, tempo, progresja

- **4×6** = 4 serie robocze po 6 powtórzeń (rozgrzewkowe się nie liczą).
- **RIR** (reps in reserve) = ile czystych powtórzeń zostało w zapasie. W ćwiczeniach ze sztangą nigdy do upadku.
- **Tempo 3-0-X** = 3 s w dół, bez pauzy, w górę z maksymalną intencją szybkości.
- **Superseria 3A/3B** = 3A, 60 s przerwy, 3B, 60 s, znów 3A.

**R8 – progresja ciężaru** (sugestia na następny tydzień dla danego ćwiczenia):

| Wynik ostatniej sesji | Sugestia |
|---|---|
| Wszystkie serie: zadane powtórzenia przy RIR ≥ zadany | +2,5 kg (przysiad, martwy ciąg, hip thrust); +5 kg jeśli RIR ≥ zadany + 2; +1–2 kg na hantel |
| 1 seria z brakującym powtórzeniem | ten sam ciężar |
| ≥ 2 serie z brakami | ten sam ciężar; jeśli drugi raz z rzędu → −10% i odbudowa |
| Zmiana liczby powtórzeń w nowym tygodniu (np. 5×5 → 5×4) | +2,5–5 kg względem poprzedniego ciężaru roboczego |
| Tydzień rozładowania | ciężar −10%, serie −40%, RIR +1 |
| Tydzień 1–2 (wdrożenie) | ciężar wybierany tak, by RIR = 4 |

Waga startowa ćwiczenia: jeśli brak historii, aplikacja pyta „jaki ciężar dasz radę zrobić 8× z zapasem 3–4 powtórzeń?” i zapisuje go jako punkt startu.

## 4. Tydzień wzorcowy i hierarchia ważności

| Dzień | Domyślnie |
|---|---|
| Pon | wolne |
| Wt | Z2 (w fazie I z kadencją; w lecie w upale) |
| Śr | **akcent rowerowy** (test / sweet spot / próg / VO2) + **siłownia A** (lub C) |
| Czw | Z2 krótko lub regeneracja / wolne |
| Pt | **siłownia B** (do tyg. 28), potem wolne lub Z1 |
| Sob | **długa jazda** (od fazy IV także back-to-back lub góry) |
| Nd | pagórki / gravel / Z2 (albo drugi dzień bloku) |

**Hierarchia ważności** – gdy trzeba coś wyciąć, wycinaj od dołu:
1. Środowy akcent rowerowy
2. Sobotnia długa jazda (lub dzień w górach / back-to-back)
3. Sesja siłowa A (C)
4. Niedzielna jazda
5. Sesja siłowa B
6. Wtorkowe Z2
7. Czwartkowe Z2

## 5. Reguły adaptacji (silnik aplikacji)

| ID | Sytuacja | Reakcja aplikacji |
|---|---|---|
| **R1** | Pominięty środowy akcent | Zaproponuj przeniesienie na **czwartek** (zamiast Z2). Wtedy piątkowa Sesja B w wersji lżejszej (−1 seria, RIR +1). Jeśli pominięty też w czwartek → akcent przepada, **nigdy** nie dokładaj go w piątek/sobotę. Nigdy dwóch akcentów dzień po dniu. |
| **R2** | Pominięta sobotnia długa jazda | Przenieś na niedzielę (zastępuje niedzielny trening). Nie dokładaj w poniedziałek. |
| **R3** | Pominięta Sesja A | Zrób w czwartek (po Z2 lub zamiast). Pominięta Sesja B → przepada w tym tygodniu (nie przenoś na sobotę). |
| **R4** | Gołoledź / śnieg / < −5 °C | Dzień akcentu → `INDOOR_4x4` (Wattbike) + siłownia. Dzień Z2 → 45–60 min Z2 na rowerku/wioślarzu lub marsz 60 min. Długa jazda → 90 min rowerek Z2 **albo** przesunięcie na drugi dzień weekendu. Przycisk „Gołoledź” w widoku dnia. |
| **R5** | Choroba | Gorączka / objawy „poniżej szyi” → **zero treningu**. Katar bez gorączki → tylko Z1 do 45 min, bez siłowni. Po ≥ 3 dniach przerwy: 2 dni tylko Z2 krótko. Po ≥ 7 dniach: powtórz poprzedni tydzień planu (przesunięcie całego kalendarza o tydzień **tylko** w fazach I–III, w IV–V skróć zamiast przesuwać). |
| **R6** | Poranny check-in słaby | Wskaźniki: sen 1–5, nogi 1–5, motywacja 1–5, tętno spoczynkowe. Jeśli tętno spoczynkowe > średnia 7-dniowa + 7 bpm **dwa dni z rzędu** albo suma ocen ≤ 6 → obniż dzień: akcent → Z2 60 min, Sesja A/B → wersja lżejsza (−1 seria, RIR +1). Pokaż wyjaśnienie. |
| **R7** | Rower ma pierwszeństwo | Jeśli **2 tygodnie z rzędu** akcent rowerowy oznaczony jako „nie wyszedł” (RPE ≥ 9 przy niewykonanych celach), a ciężary rosną → sugestia: −1 seria w Sesjach A i B do końca bloku. |
| **R8** | Progresja ciężarów | Tabela w sekcji 3. |
| **R9** | 48 h ochrony | **Brak Sesji A w ciągu 48 h przed**: testem, weekendem back-to-back, weekendem w górach, blokiem 3-dniowym. Jeśli użytkownik przesunie dni i naruszy regułę → ostrzeżenie + propozycja przeniesienia Sesji A wcześniej lub zamiany na core. |
| **R10** | Tempo redukcji | Spadek > 1% masy/tydz. przez 2 tygodnie → sugestia +200–300 kcal. Spadek LTHR/FTP > 3% w teście przy jednoczesnej redukcji → pauza w deficycie na 2 tygodnie. Waga ≤ cel → deficyt wyłączony. |
| **R11** | Nowy wynik testu | Przelicz strefy od następnego dnia; pokaż różnicę względem poprzedniego testu. |
| **R12** | Tydzień rozładowania | Rower: brak interwałów poza `DELOAD_WED`, objętość ~−40%. Siła: −40% serii, −10% ciężaru, RIR +1. |
| **R13** | Upał > 28 °C | Cele tętna Z2–SS −3–5 bpm, picie 750 ml/h + elektrolity, przy VO2 skróć do 4 powtórzeń. |
| **R14** | Zmiana daty wyjazdu | Przelicz kalendarz **od końca**: taper = 2 ostatnie tygodnie, faza V = 6 tygodni przed taperem, faza IV wypełnia resztę od 26.04.2027. Fazy I–III są przypięte do dat (sezonowość). Jeśli na fazę IV zostaje < 6 tygodni → skróć fazę III od końca (zachowaj tydzień testowy). |
| **R15** | Zamiana dni przez użytkownika | Dozwolona w obrębie tygodnia. Walidacja: brak dwóch akcentów dzień po dniu, R9, poniedziałek wolny może zamienić się z czwartkiem. |
| **R16** | Skalowanie objętości | Ustawienie `volume_scale` (0,7–1,0) skraca jazdy Z2, długie i pagórki proporcjonalnie (min. 45 min dla Z2, min. 90 min dla długiej). Akcenty, testy, góry i back-to-back bez zmian. Domyślnie 1,0 – obniż, gdy tygodnie w pracy są cięższe. |

## 6. Pogoda, rower, bezpieczeństwo

**Wybór roweru (sugestia w widoku dnia):**
- Dogma: sucha szosa, > 5 °C, bez soli na drodze. Fazy I, III, IV – treningi szosowe.
- Checkpoint: mokro, zima (faza II), sól, szuter, **wszystkie weekendy w górach, back-to-back i bloki z bagażem**, faza V i wyjazd.
- Wattbike: `INDOOR_4x4`, `WATTBIKE_TEST`.

**Zima (faza II):** ubiór na cebulkę (merino → polar/roubaix → kurtka z membraną), ochraniacze na buty, rękawice typu lobster, ciśnienie w oponach −0,3 bar, światło przód ≥ 800 lm + tył z radarem przez cały dzień, stałe tempo bez długich postojów, bez sprintów, po których się marznie.

**Zjazdy z górami (od fazy IV):** pozycja nisko, hamowanie pulsacyjne (mocno–puść), nigdy ciągłe; patrz w wyjście z zakrętu. Na Dogmie z hamulcami szczękowymi nie jeździmy długich górskich zjazdów.

**Jedzenie na rowerze:** od 45. minuty; 60–80 g węglowodanów/h na jazdach > 90 min, 70–80 g/h na podjazdach; 500–750 ml płynu/h (więcej w upale). Żel **przed** głodem.

## 7. Strategia na alpejską przełęcz (8 km / 700 m / 8,8%)

- Przełożenie **40/50**: 7,5 km/h ≈ 72 rpm (przy 8,5 km/h ≈ 81 rpm).
- Pierwsze 2 km: **10–15 uderzeń poniżej LTHR**. Kiedy inni odjeżdżają – ignoruj. Równe tempo wygrywa po 4. km.
- Jedzenie: 1 bidon izotoniku (~40 g węgli) + 1 żel (30–40 g) na godzinę wspinaczki, małe łyki co 10 min.
- Na podjazdach > 1 h: 500–750 ml płynu/h.
