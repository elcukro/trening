# 23 – „Zapytaj trenera” (18.10.2026)

Czat z trenerem w uproszczonym interfejsie `/i` (ekran Dziś → sekcja „Trener”). Zawodnik pisze albo dyktuje jedno zdanie
(„waga 104,8, nogi 3, spałem źle, jutro bez jazdy”), a dane lądują w tabelach; może też zapytać o plan, o ostatnią jazdę,
poprosić o przeniesienie jazdy albo wysyłkę na Bolta. Punkt 1 z backlogu `docs/21` § 2.

## Podział ról: aplikacja ma dane i narzędzia, serwer tylko rozmawia
1. **Kontekst buduje aplikacja** (`src/ios/coachContext.ts`, czysty TS, testy `src/ios/__tests__/coachContext.test.ts`):
   dni od −7 do +7 z wynikiem (`done/modified/skipped/missed/extra/free/pending`) i stanem na Bolcie, jazdy ze Stravy z 14 dni
   (czas, km, moc tylko z miernika, tętno, TSS/IF z `rideLoad`, dryf, notatka trenera), check-iny, logi, aktywne nadpisania,
   ustalenia o zawodniku (`program.coach_notes`), cel, FTP/LTHR, ostatnia masa i masa docelowa. Do tego **sygnały luzowania**
   policzone kodem (`flags`: tętno spoczynkowe > średnia 7 dni + 7 bpm × 2 dni – `restingHrAlarm` z silnika, nogi ≤ 2 × 2 dni,
   suma ocen ≤ 6 × 2 dni, choroba, ≥ 2 opuszczone treningi). Kontekst idzie z **każdą** wiadomością, więc po zapisie
   narzędziem model widzi już nowe dane. Dlaczego nie serwer: plan z nadpisaniami liczy silnik w aplikacji (jak przy Wahoo).
2. **Edge Function `coach-chat`** (`supabase/functions/coach-chat/index.ts`, JWT): sanityzuje historię (`sanitizeMessages` –
   tylko role user/assistant, znane bloki, osierocone `tool_result` wyrzucone, bloki myślenia tylko w ostatniej turze
   asystenta, limit 40 wiadomości / 60 k znaków) i kontekst (`sanitizeContext`, ≤ 40 k znaków), wkleja kontekst jako pierwszy
   blok pierwszej wiadomości (`withContext`), woła model z definicjami narzędzi (`callClaudeChat` w `ai_note.ts` – ten sam
   model co notatki, `AI_MODEL`, myślenie adaptacyjne z niskim wysiłkiem, podręcznik w cache) i oddaje surowe bloki
   odpowiedzi + `stop_reason`. Każda tura = jeden wpis w `ai_calls` (limit miesięczny wspólny, dzienny 80 na konto –
   wyższy niż dla check-inu zdaniem, bo narzędzie to dodatkowa tura). Czysty TS: `_shared/coach_chat.ts`, testy
   `src/engine/__tests__/coach_chat.test.ts`.
3. **Narzędzia wykonuje aplikacja** (`src/ios/coachTools.ts`, testy `coachTools.test.ts`), model tylko o nie prosi:
   - `save_checkin` – `upsertCheckin`; zakresy jak w check-inie zdaniem (waga 40–200, tętno 30–120, oceny 1–5),
     pola pominięte bez zmian, uwagi ≤ 300 znaków;
   - `set_rpe` – RPE 1–10 do `session_logs` (jazda albo siłownia zależnie od dnia), opcjonalnie notatka;
   - `mark_skipped` – log `skipped` + nadpisanie `skip` (plan, Bolt i raporty widzą „nie ma treningu”);
   - `move_ride` – `validateMove` z silnika (tylko dzień wolny, ten sam miesiąc, nie w przeszłość, R15), zapis jak w
     Kalendarzu (`move` z `what: 'bike'`); odmowa wraca do modelu z powodem, żeby zaproponował inny dzień;
   - `push_wahoo` – `pushPayloadFor(dziś, 7)` + `wahoo.push` (z nadpisaniami, jak automat dzienny).
   Wynik narzędzia to zdanie po polsku; wraca do modelu jako `tool_result` i pokazuje się w czacie jako zielona/czerwona linia.
4. **Pętla w arkuszu** (`src/ios/components/CoachSheet.tsx`, dane z `useCoach.ts`): wiadomość → model → gdy
   `stop_reason = tool_use`, aplikacja wykonuje narzędzia, dokłada wyniki i woła model znowu; najwyżej 4 rundy na wiadomość.
   Bloki myślenia (`thinking` z podpisem) muszą wrócić do modelu w kontynuacji – dlatego historia trzyma surowe bloki.
5. **Historia w `kv`** (`src/sync/coachChat.ts`): klucz `coach_chat:<data>`, lokalnie (kv nie jest synchronizowane),
   rozmowy starsze niż 7 dni znikają przy otwarciu czatu. „Wyczyść” w nagłówku arkusza kasuje dzień.

## Co model może, a czego nie
- Zapisuje dane od razu, gdy padły w zdaniu (bez dopytywania o resztę pól). Słownik skal jak w `checkin_parse.ts`.
- Przeniesienie, pominięcie i wysyłka na Bolta zmieniają plan: bez pytania tylko na wyraźną prośbę zawodnika; gdy model sam
  to proponuje, pyta jednym zdaniem. Po przeniesieniu/pominięciu proponuje wysyłkę na Bolta.
- Nie wymyśla treningów i nie zmienia struktury planu (plan jest deterministyczny – `docs/21` „Nie robić”).
- Liczby tylko z kontekstu albo z wiadomości zawodnika; przy sygnałach w `flags` mówi o nich wprost (kryteria luzowania
  z `docs/13` i pamięci „blok mocny”). Bez diagnoz medycznych.

## Uruchamianie i koszt
- Deploy: `supabase functions deploy coach-chat --no-verify-jwt --use-api`; sekrety te same co dla notatek
  (`ANTHROPIC_API_KEY`, opcjonalnie `AI_MODEL`). Bez migracji – `ai_calls` z `activity_id = null` jak przy check-inie zdaniem.
- Koszt: podręcznik w cache, kontekst ok. 5–10 k tokenów na turę (14 dni jazd z notatkami); zwykła wymiana 1–2 tury,
  z narzędziem 2–3. Limit dzienny 80 tur na konto; przekroczenie daje w czacie komunikat „limit dzienny rozmów”.
- Bez konta (`supabase === null`) sekcja „Trener” nie pojawia się na ekranie Dziś.

## Dalej
- Przyciski szybkich pytań w pustym czacie są stałe (`EXAMPLES`) – można je uzależnić od kroku dnia (`dayState`).
- Monitor spadku formy (pkt 4 backlogu) może reużyć `flags` z `coachContext.ts` – te same kryteria, mail poranny zamiast czatu.
- Historia per dzień oznacza, że rozmowa z wczoraj nie jest widoczna dziś; jeśli to będzie przeszkadzać – jeden klucz z
  ostatnimi 7 dniami.
