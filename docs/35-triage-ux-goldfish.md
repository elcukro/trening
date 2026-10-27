# 35. Triage oceny UX „goldfish” (27.10.2026)

Źródło: niezależna ocena „na świeżo” (sesja bez kontekstu projektu, produkcja `/m`, 375×812, konto główne, wyłącznie oglądanie) – `~/code/goldfish-ux/raport-ux.md` + 16 zrzutów. Ocena ogólna 5/10. Każdy punkt sprawdzony w kodzie.

Klasy: **BŁĄD** – kod robi coś złego; **UX** – działa zgodnie z kodem, ale krytyka trafna; **DECYZJA** – skutek decyzji z docs (krytyka może mieć sens); **ARTEFAKT** – skutek warunków oceny.

## Wynik

| # | Klasa | Co naprawdę jest | Poprawka | Wysiłek |
|---|---|---|---|---|
| W1 | **BŁĄD** | Brakujący `/assets/*` na Vercelu oddaje 200 + `index.html` (reguła `/assets/:path*` → siebie nie zatrzymuje catch-all, sprawdzone `curl`). SW po wdrożeniu zapisuje HTML jako JS → biały ekran do następnej zmiany hasha. | catch-all bez `assets/` (404), strażnik w `src/sw.ts` odrzucający HTML dla `.js/.css`, samonaprawa w `index.html` (pusty `#root` → wyrejestruj SW, wyczyść cache, przeładuj raz) | S |
| W2 | ARTEFAKT + UX | Stara domena: 301 w `vercel.json` nie działa, bo nawigacje obsługuje zainstalowany SW ze starym bundlem (sprzed `/m`). Drugie logowanie nieuniknione (sesja per origin). | w `sw.ts` na hoście `trening-inky.vercel.app`: wyrejestrowanie + `client.navigate` na nową domenę; baner w języku konta | S |
| W3 | **BŁĄD** | Jazda w dzień bez planu: `dayPhase` daje `morning`/`rest` mimo `hasActivity` (`src/day/dayState.ts:162`), „Ostatnia jazda” pomija dzisiejszą (`TodayScreen.tsx:140`). | `after` w wariancie „dodatkowa jazda” + wiersz do podsumowania | S/M |
| W4 TSS | **BŁĄD** | `/` liczy TSS dnia bez planu bez FTP (z tętna, 45), `/m` z mocy (53) – `DayView.tsx:74` vs `loadOf` w `useIos.ts`. | jedna ścieżka `loadOf` | S |
| W4 CTL | **BŁĄD** | Notatka AI liczy CTL własną formułą tylko z Wahoo/FIT (`ride_facts.ts:126`), aplikacja `pmcSeries` ze wszystkich źródeł. | wspólna formuła TSS w `_shared/` albo w notatce trend zamiast liczby | M |
| W4 LTHR | UX | Ja pokazuje obok siebie LTHR z testu (160, obowiązuje – R11) i ręczne `lthr_bpm` (175, martwe). To samo FTP. | wiersz „Progi” = wartość obowiązująca + źródło | S |
| W4 masa | DECYZJA | 91 kg to punkt kontrolny na 1.03.2027, 82 kg cel końcowy. | etykieta „punkt kontrolny 91 kg do 1.03 (cel 82)” | S |
| W4 białko | ARTEFAKT | 150/160 g to stary bundle (sprzed 30.09); kod ma jedno źródło (180 g). | znika z W1/W2 | – |
| W5 | DECYZJA | Trzy wyglądy (`/` komputer, `/i` zapas, `/m` telefon), część funkcji tylko w `/`. Języki – stary bundle. | integracje i konto do `/m` (też luka App Store, docs/26); „poprzedni wygląd” głębiej; `/i` wygasić | M/L |
| S1 | **BŁĄD** | Plan: każda jazda = ✓ (status logu ma pierwszeństwo), podsumowanie mówi „inna niż plan” (score). Jazda w dzień wolny (`extra`) nie liczy się do „X z 4”. | jedna reguła statusu (`score < 70` → `modified`) dla Planu, Dziś, podsumowania; osobny symbol + legenda; „+1 dodatkowa” | M |
| S2 | UX | Przenieś/zamień/pomiń tylko przytrzymaniem; docs/24 przewidywał „Przenieś” na ekranie dnia. | „⋯” w wierszu dnia i karcie dnia → `DayMenuSheet` | S |
| S3 | **BŁĄD** (skutek uboczny) | `profiles.locale` = język ostatnio wyświetlany; urządzenie po angielsku przełącza język maili, notatek i AI całego konta. **Oba konta mają dziś `locale = en`** (główne od 15:43 – panel oceny, drugie od 10:27). | `locale` zmieniać tylko przy jawnym wyborze języka; obu kontom `language = locale = 'pl'` | S |
| S4 | UX | FTP/TSS/CTL/TSB bez objaśnień (objaśnienia tylko w `help.html`). | arkusz „co to znaczy” po dotknięciu kafla, forma zdaniem | S/M |
| S5 | UX | Żywienie 2–3 razy tym samym zdaniem (FoodCard + wiersz + karta dnia wolnego). | przy FoodCard bez wiersza Nutrition | S |
| S6 | DECYZJA | Posiłek tylko zdjęciem – Beta 1 (docs/25 § 5); wpis ręczny w Beta 2. | „Wpisz ręcznie” (kcal, białko) | S/M |
| S7 | DECYZJA | Ja = postęp + ustawienia (docs/24 § 2, 3 zakładki). | ustawienia/maile/integracje/konto do arkusza „Ustawienia” (zębatka) | M |
| S8 | UX (nie błąd) | Pasek zakładek pływa z założenia; padding na dole wystarcza, tło 0,86 za przezroczyste. | tło 0,95 | S |
| S9 | DECYZJA | Osobny ekran jazdy (docs/24 § 3–4); słabe: odsyłanie „briefing” i dubel nagłówka. | usunąć `briefingHint`, krótszy nagłówek | S |
| S10 | UX | „Bolt ma starszą wersję” szare, bez akcji; „Wyślij” drugorzędne. | przy `stale`/`missing` w dniu treningu „Wyślij na Bolta” jako główny + zdanie z konsekwencją | S |
| N1 | UX | „Tired” (TSB −28…−12, ton `ok`) na zielono. | `ok` neutralny, `good` zielony | S |
| N2 | UX | Jazdy „Cycling” – nazwa z Wahoo (`mergeRides` zostawia Wahoo). | nazwa generyczna → nazwa treningu z planu, inaczej bliźniak ze Stravy | S |
| N3 | **BŁĄD** | Dzień wolny przed check-inem: oś kroków z jedną kropką. | oś tylko przy > 1 kroku | S |
| N4 | **BŁĄD** (prawdopodobny) | `runSync` bez limitu czasu – zawieszone żądanie blokuje kolejne, „Syncing…” bez końca; błąd sync niewidoczny w Ja. | limit 30–45 s → `error`; „Zsynchronizowano HH:MM”, błąd + „Ponów” | S |
| N5 | UX | „Week so far” na każdym tygodniu, symbole ✓ + – ★ bez legendy, boczne tygodnie pagera bez `inert`. | nagłówek wg tygodnia, legenda, `aria-label`, `inert` | S |
| N6 | UX | Check-in: dwa „Zapisz”, placeholder wagi wygląda jak wpis, RHR „52” zmyślony. | jeden przycisk, placeholder „ostatnio 103 kg (25.10)”, RHR z ostatniego albo pusty | S |
| N7 | UX (częściowo) | RPE ma toast. Chipy czatu wysyłające i wstawiające wyglądają tak samo – „Wyślij na Bolta” wysyła od razu. | odróżnić chipy albo wszystkie wstawiać; `bolt` → prefill | S |
| N8 | UX | Cel (FTP 30 km/h, masa, data) rozproszony; docelowe FTP tylko w stopce. | karta „Twój cel” na górze Ja | S/M |

**Bilans:** 8 błędów (W1, W3, W4 TSS i CTL, S1, S3, N3, N4), 15 uwag UX trafnych przy działającym kodzie, 5 decyzji (z czego 3 warte rewizji: W5, S7, S6), artefakty W2/białko znikają po naprawie W1+W2.

## Plan poprawek

**Paczka 0 – pilne (produkcja, dziś):** W1, W2, S3 (kod + przywrócenie `pl` obu kontom – zapis w bazie za zgodą). Potem e2e i ręczny test SW na podglądzie.

*Stan 27.10.2026 – zrobione:* W1 – `vercel.json` przepisuje na `index.html` wszystko poza `assets/` (brakujący plik = 404), `src/sw.ts` odrzuca w precache odpowiedź HTML dla `.js/.css` (instalacja się przerywa i ponawia później), `index.html` ma samonaprawę (błąd wczytania skryptu/arkusza albo `vite:preloadError` → raz na kartę: wyrejestrowanie SW, czyszczenie pamięci, przeładowanie; e2e `selfheal.spec.ts`). W2 – nowy SW na `trening-inky.vercel.app` niczego nie zapisuje: wyrejestrowuje się, czyści pamięć i przenosi okna na `trening.felsztukier.pl` (zainstalowana na ekranie początkowym PWA ze starej domeny i tak wymaga ponownego dodania z nowej). S3 – `languagePatch`; obu kontom `language = locale = 'pl'` w bazie (17:29 UTC).

**Paczka 1 – błędy logiki:** W3, S1, W4 TSS, N3, N4 + W4 LTHR/masa (etykiety). Testy w `src/day/__tests__` (dayPhase, weekState), e2e `mobile.spec.ts`.

*Stan 27.10.2026 – zrobione:* W3 – `dayPhase` daje `after`/`evening` dla jazdy w dzień bez planu, karta „Dodatkowa jazda” z czasem zamiast zgodności. S1 – jedna granica `MODIFIED_BELOW = 70` w `src/engine/analysis.ts` (`statusFromScore`, werdykt, Dziś, podsumowanie, Plan); `weekState` bierze zgodność z kv `analysis:<klucz>` i ma ona pierwszeństwo przed logiem „done” z serwera; symbol ≈ w Planie; „+ 1 dodatkowa” w bilansie tygodnia. W4 TSS – `loadFtp` w `src/engine/progress.ts` (moc tylko z `power_meter`) w `/m` i w `/`. N3 – oś kroków od dwóch kroków. N4 – `runSync` z limitem 45 s (`SYNC_TIMEOUT_MS`, numer próby zamiast wiecznego `running`), błąd po ludzku; Ja: „zsynchronizowano HH:MM”, przy błędzie zdanie + „Ponów synchronizację”. W4 LTHR – wiersz „Progi i miernik” pokazuje obowiązujące FTP/LTHR ze źródłem (test z datą / szacunek / wpisane). W4 masa – etykieta „do punktu kontrolnego 91 kg na 1.03 (cel 82 kg)”. Testy: `dayState`, `weekState`, `progress`, `syncTimeout`, `weight_deficit`. Legenda symboli Planu i reszta N5 – paczka 2.

**Paczka 2 – szybkie UX (każde S):** S2, S5, S8, S9, S10, N1, N2, N5, N6, N7.

**Paczka 3 – większe, do decyzji użytkownika:** W5 + S7 (integracje, konto i ustawienia w `/m`, wygaszenie `/i`), S4 (objaśnienia), N8 (karta celu), S6 (wpis ręczny posiłku), W4 CTL (wspólna formuła albo trend w notatce).

Po paczkach 0–2: powtórzyć ocenę goldfish tym samym briefem (nowa sesja, pusty folder) i porównać.

## iOS

Aplikacja iOS to ten sam kod `/m` (build `VITE_TARGET=ios`, bundle w aplikacji, bez service workera), więc paczki 1–3 trafiają do niej bez osobnej pracy – ale dopiero po `npm run build:ios` i nowym buildzie w Xcode (bundle się nie aktualizuje sam). Z paczki 0 iOS dotyczy tylko S3 (telefon po angielsku też przełączał język maili); W1 i W2 to wyłącznie przeglądarka.

Ocena przeglądarkowa nie widziała rzeczy tylko z iOS: ekran startowy (`Intro`), logowanie Google w systemowym oknie, krok „Ciało” ze Zdrowia, „Udostępnij → Trening” dla `.fit`, systemowe arkusze potwierdzeń, haptyka, klawiatura i safe areas na prawdziwym ekranie oraz luki App Store z docs/26 (usuwanie konta, polityka prywatności, zgoda na AI). Dlatego powtórna ocena po paczkach 0–2 idzie w **symulatorze iOS**, a nie w panelu przeglądarki: ten sam brief plus lista elementów natywnych. Jedno badanie sprawdza wtedy poprawki i część iOS. Tego, czego symulator nie odda (haptyka, Zdrowie z danymi, prawdziwa klawiatura), użytkownik ocenia na telefonie.
