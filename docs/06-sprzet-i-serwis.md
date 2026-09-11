# 06 · Sprzęt, serwis i checklista wyjazdowa

Dane maszynowe: `data/gear_tasks.json` (zadania z terminami) i `data/packing_list.json` (checklista).

## 1. Rowery i ich role

### Trek Checkpoint ALR 4 – rower na Alpy, zimę i góry
- **Napęd po modyfikacji:** SRAM Apex 1 11s, korba Apex 1 Wide DUB, blat **40T X-Sync (direct mount, 8 śrub)**, wózek **Garbaruk SRAM 11/12s** z fabrycznymi kółkami, kaseta **SunRace CSMX80 11-50T** (11-13-15-18-21-24-28-32-36-42-50, 520 g), łańcuch **SRAM PC-1130 120 ogniw**.
- Najlżejsze przełożenie **40/50 = 0,80**; najcięższe 40/11 = 3,64.
- Kadencja przy 7,5 km/h: ~72 rpm; przy 8,5 km/h: ~81 rpm.
- Koła: Bontrager Paradigm (21 mm wewn., bębenek Shimano HG, tubeless ready).
- Hamulce tarczowe 160 mm (maksimum ramy) – **zweryfikować typ** (SRAM HRD vs Tektro mechaniczne).
- Otwory na błotniki (→ SKS Bluemels 45 zamiast clip-on Speedrocker).

### Pinarello Dogma 60.1 (60HM1K) – rower treningowy na szosę
- Pełny karbon łącznie z kołami, Shimano Dura-Ace 10s, korba Rotor 3D compact 50/34, hamulce szczękowe.
- Idealna do: sweet spot, tempo 30 km/h, długich jazd po suchym.
- **Nie do Alp:** hamulce szczękowe na karbonowych obręczach przy ~120 kg systemu na 8-kilometrowym zjeździe grożą przegrzaniem obręczy; najlżejsze przełożenie 34/28 = 1,21 (≈ 49 rpm przy 7,5 km/h na 8,8%).
- Pasuje łańcuch 10s (np. SRAM PC-1031, 114 ogniw).
- **Sprawdzić limit wagowy kół.**

### Elektronika
- Wahoo ELEMNT Bolt v2, pas tętna, czujnik kadencji. Brak miernika mocy.
- Bolt w trakcie zaplanowanego treningu pokazuje cel dla interwału, diody LED (pozycja względem celu tętna/mocy), odliczanie do zmiany i sygnał dźwiękowy.
- Użytkownik ma już **aplikację deweloperską Wahoo** (projekt `~/code/wahoo-routes`, sandbox, OAuth z `WAHOO_CLIENT_ID/SECRET`) – można ją wykorzystać do eksportu treningów.

## 2. Zadania sprzętowe z terminami

| Tydz. | Termin | Rower | Zadanie | Szczegóły |
|---|---|---|---|---|
| 0 | 2026-09-13 | checkpoint | **Montaż napędu 40/50** | Wózek Garbaruk SRAM 11/12s (fabryczne kółka i śruby), kaseta SunRace CSMX80 11-50 (zostaw podkładkę 1,85 mm), łańcuch SRAM PC-1130 – długość: na 40T i 50T z pominięciem przerzutki + 2 ogniwa, spinka PowerLock. Ustaw śrubę B: górne kółko ok. 5–6 mm od zębów 50T na najlżejszym biegu. Sprawdź zmiany na całej kasecie. |
| 1 | 2026-09-20 | checkpoint | **Sprawdź typ hamulców Checkpointa** | SRAM HRD (hydrauliczne) czy Tektro (mechaniczne)? Od tego zależy wybór klocków spiekanych na wiosnę. |
| 1 | 2026-09-20 | dogma | **Dogma: limit wagowy kół i największa zębatka** | Sprawdź limit wagi systemu dla kół karbonowych (instrukcja/producent). Sprawdź największą zębatkę kasety; opcjonalnie kaseta 12-30 Shimano 105 10s (~150 zł) na podjazdy. |
| 1 | 2026-09-16 | — | **Ustaw strefy tętna w aplikacji ELEMNT** | Po teście progowym wpisz LTHR i strefy (lub zsynchronizuj z aplikacji treningowej). Powtarzaj po każdym teście. |
| 2 | 2026-09-27 | checkpoint | **Zapas spinek 11s** | PowerLock jest jednorazowy – kup 2–3 spinki 11s lub jedną wielorazową (KMC MissingLink 11s). |
| co miesiąc | — | both | **Kontrola zużycia łańcucha** | Miernik łańcucha co miesiąc / ok. 1000 km. Wymiana przy 0,5% (11s) – chroni kasetę 11-50 (duża zębatka aluminiowa). |
| 10 | 2026-11-22 | checkpoint | **Pakiet zimowy** | Pełne błotniki SKS Bluemels Basic 28" 45 mm (~120 zł) na otwory w ramie; światło przód ≥ 800 lm + tył z radarem; odzież: merino, roubaix, kurtka z membraną, ochraniacze na buty, rękawice typu lobster. |
| 15 | 2026-12-27 | — | **Decyzja: miernik mocy?** | Jeśli przez 3 miesiące plan jest realizowany – rozważ pedały Favero Assioma (~1900–2200 zł, ten sam system bloków na oba rowery). Najbardziej precyzyjne prowadzenie interwałów. |
| 30 | 2027-04-11 | both | **Serwis wiosenny** | Checkpoint: klocki spiekane SRAM Road 00.5318.010.004 (jeśli SRAM HRD; 2 kpl. ~190 zł), płyn hamulcowy DOT (co 12 mies.), łańcuch, linki. Dogma: przegląd, klocki do obręczy karbonowych. |
| 33 | 2027-05-02 | checkpoint | **Opony na lato i Alpy** | Decyzja: GP 5000 S TR 32c z dętkami (szybkie, ~520 zł/para) lub GP 5000 AS TR 35c (tubeless, więcej komfortu). Założyć przed pierwszym weekendem w górach. |
| 36 | 2027-05-23 | checkpoint | **Ocena przełożenia po Karkonoszach** | Czy 40/50 wystarczało na najbardziej stromych odcinkach przy kadencji ≥ 70 rpm? Jeśli nie – blat Garbaruk DM 8-bolt 38T (~300–360 zł). |
| 48 | 2027-08-15 | checkpoint | **Serwis przedwyjazdowy** | Nowy łańcuch (jeśli zużycie ≥ 0,4%), klocki (zapasowy komplet do sakwy), opony (stan, przecięcia), płyn/linki, dokręcenie śrub, hak przerzutki na zapas, mleko/dętki, test na 100 km przed blokiem 3-dniowym. |
| 52 | 2027-09-09 | — | **Pakowanie na wyjazd** | Wg checklisty w aplikacji (moduł Wyjazd). |

## 3. Checklista wyjazdowa (bikepacking, noclegi mieszane)

**System:** Jeden kolor worka = jedna kategoria, zawsze w tym samym miejscu. Im rzadziej czegoś potrzebujesz, tym głębiej leży.

| Torba | Zawartość |
|---|---|
| Podsiodłówka Ortlieb | Na dno: śpiwór w worku kompresyjnym (biwak) lub ubranie zapasowe; potem worek „wieczór” (bielizna, skarpety, koszulka, lekkie spodnie); najbliżej rolki: kosmetyczka i ręcznik. |
| Torba na ramę (wisząca) | Na dnie rolka z narzędziami i dętką; wyżej powerbank i elektronika w małym worku; na górze jedzenie na dzień. |
| Mała torba na górną rurę | Telefon, żele i batony, portfel, klucze, krem z filtrem. |

| Kategoria | Rzecz | Cena | Link |
|---|---|---|---|
| Organizacja | Worki Ortlieb PS10 1,5 l × 2 (różne kolory) | 59 zł | [sklep](https://e-velomania.pl/worek-ortlieb-dry-bag-ps10-1.5l-czarny) |
| Organizacja | Exped Fold Drybag UL XS 3 l | 50 zł | [sklep](https://cragstore.pl/worek-wodoodporny-exped-drybag-ul-xs) |
| Organizacja | Sea to Summit Ultra-Sil Garment Mesh Bag S (wilgotne ubrania) | 82 zł | [sklep](https://www.wypad.com.pl/pl/p/Worek-bagazowy-Sea-To-Summit-Ultra-Sil-Garment-Mesh-Bag-Small-Blue-Atoll/9402) |
| Organizacja (biwak) | Sea to Summit Ultra-Sil eVent Compression XS 6 l (śpiwór) | 70 zł | [sklep](https://www.campingshop.pl/worek-kompresyjny-ultra-sil-event-dry-6l-sea-to-summit) |
| Organizacja | Paski Voile 2 szt. (mokre buty, kurtka na zewnątrz) | 60 zł | [sklep](https://www.splitboards.eu/english/touring-equipment/voile-straps/sortiment/1363/voile-strap-nano-9-23cm) |
| Organizacja | Składany plecak Sea to Summit Ultra-Sil 20 l (sklep, miasto) | 80 zł | [sklep](https://www.campingshop.pl/plecak-turystyczny-ultra-sil-daypack-20l-sea-to-summit) |
| Kosmetyczka | Matador FlatPak Waterproof Toiletry Case | 98 zł | [sklep](https://www.campingshop.pl/kosmetyczka-turystyczna-flatpak-waterproof-toiletry-case-matador) |
| Kosmetyczka | Buteleczki GoToob+ S 53 ml × 3 (krem z filtrem, krem na siodło, płyn do prania) | 66 zł | [sklep](https://www.campingshop.pl/zestaw-pojemnikow-na-plyny-gotoob-s-3-pack-redorangeclear-humangear) |
| Kosmetyczka | Szampon w kostce, pasta w tabletkach, składana szczoteczka, mini dezodorant | — | — |
| Kosmetyczka | Ręcznik PackTowl Personal Face | 53 zł | [sklep](https://taternik-sklep.pl/recznik-szybkoschnacy-packtowl-personal-face-midnight) |
| Narzędzia | Rolka Lezyne Roll Caddy: dętka ×2, łyżki, multitool z skuwaczem, łatki, spinka 11s, trytytki, taśma | 80 zł | [sklep](https://www.centrumrowerowe.pl/torba-podsiodlowa-lezyne-roll-caddy-pd32019/) |
| Narzędzia | Zapasowy hak przerzutki (Checkpoint), zapasowe klocki, pompka / CO2, mleko do opon (jeśli tubeless) | — | — |
| Ubranie – Alpy | Kurtka przeciwdeszczowa, kamizelka wiatrowa, rękawki i nogawki, długie rękawiczki na zjazdy, czapka pod kask, buff | — | — |
| Ubranie – Alpy | 2 komplety stroju kolarskiego, krem na siodło, okulary z jasnymi szkłami | — | — |
| Wieczór | Lekkie spodnie, koszulka, bielizna, skarpety, klapki/lekkie buty | — | — |
| Elektronika | Wahoo Bolt + ładowarka, telefon, powerbank 10 000 mAh, lampki przód/tył, kable, pas tętna | — | — |
| Jedzenie | Żele/batony na 1. dzień, elektrolity (tabletki), bidony ×2 | — | — |
| Dokumenty | Dowód, karta EKUZ, ubezpieczenie z ratownictwem w górach, gotówka EUR/CHF, karta | — | — |
| Biwak (biwak) | Śpiwór, mata, namiot/bivy, czołówka, sztućce, zapalniczka | — | — |

W aplikacji checklista ma przełącznik **hotel / biwak** (pozycje z oznaczeniem „biwak” ukryte w trybie hotel) i stan odhaczenia, resetowany przed każdym wyjazdem (także przed weekendami w górach).
