# 19 – Maile treningowe (25.09.2026)

Dwa maile, każdy włączany osobno per konto (Ustawienia → E-mail, `/i` → Więcej → E-mail; domyślnie wyłączone):

- **Poranna odprawa** o `profiles.email_hour` (domyślnie 7:00, Europe/Warsaw), tylko w dni z treningiem:
  kroki z watami/tętnem/kadencją, oś czasu stref, jedzenie, uwagi dnia.
- **Podsumowanie po treningu** zaraz po imporcie nowej jazdy ze Stravy (`strava-webhook`, zdarzenie `create`):
  liczby, werdykt względem planu, czas w strefach, IF, dryf tętna, kadencja, tydzień, następny trening.

## Jak to działa
- **Szablony** – `supabase/functions/_shared/email_templates.ts`: czysty TS, tabele i style inline, tła przez `bgcolor`
  + `background-color` (skrót `background:` Gmail wycina), kropki stref jako znak w kolorze.
- **Plan liczy aplikacja** (jak dla Wahoo): `src/sync/emailSnapshots.ts` wgrywa do `email_days` migawki dni
  (7 wstecz, 14 w przód; plan z nadpisaniami, progi, strefy w bpm, plan tygodnia, następny trening, gotowa odprawa).
  Budowa migawki: `snapshotFor` w `src/app/emailViews.ts`. Bez otwarcia aplikacji przez 2 tygodnie poranków nie będzie.
- **Podsumowanie liczy serwer** wspólnym kodem `_shared/email_views.ts` (`hrZoneSeconds`, `rideLoadLite`,
  `buildWorkoutView`); zgodność ze silnikiem (`zoneDistribution`, `rideLoad`) pilnuje `src/app/__tests__/emailViews.test.ts`.
- **Wysyłka** – `_shared/email_send.ts` przez Resend (`RESEND_API_KEY` w sekretach funkcji – osobny od SMTP logowania),
  nadawca `Trening <trening@felsztukier.pl>`, linki na `APP_URL` = `https://trening.felsztukier.pl`.
  Tylko na adres właściciela konta. `email_log` (unikat user+rodzaj+ref) = jeden mail na dzień / na jazdę;
  błąd Resend zwalnia rezerwację. Stare jazdy (> 2 dni) i krótkie (< 15 min) bez maila.
- **Która jazda dostaje mail od razu (1.10.2026)** – tylko ta, która *wypełnia plan dnia*: czas w ruchu ≥ 80 %
  zaplanowanego (`fulfilsPlan`, `PLAN_FULFIL_RATIO`), a w dzień bez planu ≥ 30 min. Krótszy dojazd przed treningiem
  ani druga jazda tego dnia nie dostają osobnego maila i nie są porównywane z planem (notatka trenera też traktuje
  je jako jazdę dodatkową). O **21:00** (`EVENING_HOUR`, `runEvening` z tego samego zadania co poranek) idzie jedno
  „Dzień w liczbach” – ale tylko gdy jest jazda ≥ 15 min, o której maila nie było: tabela wszystkich jazd dnia
  (czas, km, moc, tętno, TSS), suma, ocena względem planu na jeździe, która plan wypełniła (albo najdłuższej).
  Rezerwacja w `email_log` z `ref = day:<data>`. Dzień z jedną zwykłą jazdą = jeden mail jak dotąd; dzień bez jazd = nic.
- **Harmonogram** – `pg_cron` co godzinę → `email-send {action:'cron'}` z sekretem `push_cron_secret`; funkcja sama
  sprawdza godzinę w Warszawie (zmiana czasu bez dwóch zadań jak przy push).
- **Rezygnacja** – nagłówki `List-Unsubscribe` + `List-Unsubscribe-Post` i link w stopce (podpisany HMAC, bez logowania).
- **Próby** – Ustawienia → „Próbna odprawa” / „Próbne podsumowanie” (`action:'sample'`, temat z „[PRÓBA]”, bez dziennika).

## Dostarczalność
SPF/DKIM/DMARC dla felsztukier.pl przechodzą (sprawdzone w „Pokaż oryginał”). Pierwsze maile trafiły do spamu – nowa domena
bez historii i linki do `*.vercel.app`. Stąd własna domena aplikacji `trening.felsztukier.pl` (CNAME → Vercel) i „To nie spam”
+ kontakt po stronie odbiorcy. Logowanie kodem działa na każdej domenie; przekierowań auth dla nowej domeny nie dodano
(push konfiguracji auth ryzykowałby ustawienia SMTP hostowane w panelu).

## RPE i „nogi” z maila (17.10.2026)
Mail po treningu (także „Dzień w liczbach”) ma kartę „Jak ciężko było? (RPE)” z dziesięcioma linkami, a poranna odprawa
kartę „Jak nogi dziś?” z pięcioma. Każdy link to podpisany token HMAC (`sign` z `crypto.ts`, jak przy „wyłącz te maile”):
`rpe:<user_id>:<data>:<1–10>` albo `legs:<user_id>:<data>:<1–5>`; kliknięcie trafia na `GET email-send?rpe=…` / `?legs=…`
(`applyRpe`, `applyLegs` w `email_send.ts`), funkcja zapisuje wartość (`session_logs.rpe` istniejącej jazdy dnia; `checkins.legs`,
tworząc check-in, gdy go nie ma) z `updated_at = now()`, więc aplikacja pobiera zmianę przy następnej synchronizacji.
Odpowiedź to mała strona HTML z potwierdzeniem i przyciskiem do aplikacji. Limity: RPE do 45 dni wstecz, nogi do 7 dni;
brak jazdy tego dnia = „nie zapisano”. Ponowne kliknięcie nadpisuje wartość. Zapisana ocena jest w mailu wypełniona kolorem,
gdy mail idzie po wpisie (np. „Dzień w liczbach” po RPE z pierwszego maila).

## List tygodnia (17.10.2026)
Niedziela 19:00 (`WEEKLY_HOUR`, cron `email-send` sprawdza dzień tygodnia i godzinę), dla profili z `email_weekly`
(przełącznik „List trenera w niedzielę” w Ustawieniach → E-mail i w `/i` → Więcej). Jeden mail na tydzień (`email_log` kind `weekly`,
ref = poniedziałek). Fakty liczy `_shared/week_facts.ts` (`weekFacts`: wynik każdego dnia done/modified/skipped/missed/extra/free
z migawek `email_days`, jazd i `session_logs`; sumy i porównanie z poprzednim tygodniem w `derived`; masa, tętno spoczynkowe,
nogi i sen z check-inów; `flags` z kryteriów luzowania; zapowiedź następnego tygodnia z migawek – aplikacja wgrywa je 14 dni
w przód). List pisze model (`writeLetter` w `email_send.ts`, `WEEK_SYSTEM`, ustalenia o zawodniku z `coach_notes` migawki),
weryfikacja `numbersOk` + 90–240 słów, jedna poprawka, potem `ruleLetter`. Czasy są w faktach także jako „8 h 51 min”,
żeby model mógł pisać godzinami. Szablon `weeklyEmail` (list, tabela dni z pigułką wyniku, ciało, następny tydzień, przycisk
do raportu `/postep/tydzien/<poniedziałek>`). Próba: Ustawienia → E-mail → „Próbny list tygodnia” (bieżący tydzień, bez wpisu w logu).
