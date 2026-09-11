# 04 · Żywienie i redukcja masy

> Zasady ogólne dla zdrowego, trenującego amatora. Przy chorobach przewlekłych lub lekach – konsultacja z lekarzem lub dietetykiem sportowym. Aplikacja **nie jest** narzędziem medycznym i nie powinna tak się przedstawiać.

## 1. Cel

- Masa: **~105 kg → 90 kg** (wartość startowa do potwierdzenia w aplikacji).
- Tempo: **0,4–0,5 kg/tydzień**. Przy starcie 14.09.2026 cel osiągalny między kwietniem a czerwcem 2027 – przed fazą V.
- Metryka nadrzędna: **W/kg** (FTP lub moc z testu ÷ masa, średnia 7-dniowa), nie same kilogramy.
- Efekt na podjeździe 8 km / 8,8%: −15 kg ≈ −8 min przy tej samej mocy (patrz `00-kontekst-i-decyzje.md`).

## 2. Deficyt zależnie od fazy i typu dnia

| Faza | Deficyt |
|---|---|
| PREP, I, II, III | tak – wg typu dnia |
| IV | tylko jeśli waga (średnia 7-dniowa) > cel + 0,5 kg, i tylko w dni lekkie |
| V, taper, wyjazd | **nie** – bilans zerowy lub nadwyżka w dni ciężkie |

| Typ dnia (`day_type`) | Przykład | Energia |
|---|---|---|
| `rest`, `gym`, `easy` < 60 min | poniedziałek, piątek z Sesją B | **deficyt ~500 kcal** |
| `easy` 60–119 min | wtorek Z2 90 min | **deficyt ~300 kcal** |
| `key`, `long` ≥ 120 min, góry, B2B | środa z akcentem, sobota | **bez deficytu** – paliwo na trening |
| `trip` | wyjazd | jedz do syta |

W `data/calendar.json` każdy dzień ma pole `nutrition` (`energy`, `label`, `protein_g_per_kg`, `on_bike_carbs_g_per_h`, `post_workout`).

Aplikacja nie liczy kalorii z jedzenia (poza zakresem MVP). Pokazuje **komunikat dnia** i ewentualnie orientacyjną liczbę kcal, jeśli użytkownik poda swoje zapotrzebowanie bazowe (TDEE) w ustawieniach.

## 3. Białko

- **1,6–2,0 g/kg** – domyślnie 1,8 g × masa docelowa ≈ **160–180 g/dzień**, rozłożone na 4 posiłki (po 35–45 g).
- Po siłowni i po jazdach ≥ 60 min: **30–40 g białka + węglowodany w ciągu 1–2 h**.

## 4. Paliwo na rowerze

| Czas jazdy | Węglowodany | Płyny |
|---|---|---|
| < 60 min | niepotrzebne | wg pragnienia |
| 60–90 min | 30–40 g/h | 500 ml/h |
| > 90 min, długie, góry | **60–80 g/h** od 45. minuty | 500–750 ml/h (+ elektrolity w upale) |
| Podjazdy alpejskie | **70–80 g/h**: bidon izotoniku ~40 g + żel 30–40 g, małe łyki co 10 min | 500–750 ml/h |

Zasada: **nie łączymy deficytu z długimi jazdami.** Głodówka na rowerze prowadzi do spadku mocy, infekcji i zaburzeń hormonalnych (RED-S), a nie do szybszej redukcji.

## 5. Nawyki o największym efekcie

1. Alkohol okazjonalnie (puste kalorie + gorsza regeneracja).
2. Sen 7–8 h (niedobór snu = większy apetyt i słabsza adaptacja).
3. Warzywa i białko przed węglowodanami w posiłkach poza treningiem.

## 6. Pomiar i reguły (dla aplikacji)

- Waga rano, po toalecie, **3–4 × w tygodniu**. Wykres: punkty dzienne + **średnia krocząca 7-dniowa** + linia celu (liniowa od startu do 90 kg w tempie 0,45 kg/tydz.).
- **R10:** spadek > 1% masy/tydzień przez 2 tygodnie → komunikat „zwolnij: +200–300 kcal”. Spadek LTHR/FTP > 3% w teście przy redukcji → pauza w deficycie na 2 tygodnie. Waga ≤ cel → deficyt wyłączony.
- Siła w przysiadzie może stanąć na 3–4 tygodnie przy redukcji – to normalne (komunikat w widoku postępu).
- Faza IV (maj–wyjazd): jeśli brakuje 2–3 kg do celu, **nie dociskamy** – świeże nogi dadzą więcej niż ostatnie kilogramy.
