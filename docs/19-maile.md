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
