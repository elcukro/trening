# Prompt startowy dla Claude Code

Uruchom w terminalu:

```bash
cd ~/code/trening
git init   # jeśli repozytorium jeszcze nie istnieje
claude
```

Następnie wklej poniższy prompt (najlepiej w trybie planowania – Shift+Tab):

---

Zbuduj w tym katalogu aplikację webową „Trening” – mojego osobistego asystenta treningowego na iPhone (PWA). Aplikacja ma mi każdego dnia pokazywać, co mam zrobić na rowerze, na siłowni i jak jeść, zapisywać wykonanie i prowadzić mnie do wyjazdu w Alpy we wrześniu 2027.

Cała wiedza jest już spisana – nie wymyślaj planu treningowego:
1. Przeczytaj `README.md` i `CLAUDE.md`.
2. Przeczytaj dokładnie `docs/07-specyfikacja-aplikacji.md` (architektura, silnik planu, ekrany, model danych, integracje, etapy, kryteria akceptacji) oraz `docs/01-zasady-treningu.md` (strefy, testy, reguły R1–R16).
3. Przejrzyj `docs/00`, `02`–`06` oraz dane w `data/` (`program.json`, `calendar.json`, `reference_generator.py`, `gear_tasks.json`, `packing_list.json`).

Sposób pracy:
- Zacznij od planu realizacji **Etapu 1 i 2** z sekcji 9 specyfikacji (plan offline, potem logi + synchronizacja przez Supabase). Pokaż mi plan, strukturę katalogów i listę decyzji technicznych, zanim zaczniesz pisać kod. Etapy 3 (Strava), 4 (Wahoo) i 5 (adaptacja, sprzęt, wyjazd, powiadomienia) realizujemy później, ale zaprojektuj model danych i architekturę tak, żeby nie trzeba było ich przebudowywać.
- Stack zgodnie z rekomendacją w specyfikacji (Vite + React + TypeScript + Tailwind + vite-plugin-pwa + TanStack Query + Dexie + Supabase + Recharts + Zod + Vitest). Jeśli chcesz coś zmienić, uzasadnij to przed implementacją.
- **Silnik planu** (`src/engine/`) zaimplementuj jako pierwszy, jako czysty TypeScript, przepisując logikę z `data/reference_generator.py`. Napisz test, który dla ustawień domyślnych porównuje wynik silnika z każdym dniem w `data/calendar.json`, oraz testy dla scenariuszy z sekcji 10 specyfikacji (strefy, kalkulator podjazdu, R8, R14). Nie przechodź do UI, dopóki te testy nie przechodzą.
- Treść planu (treningi, ćwiczenia, daty, fazy) ładuj z `data/program.json` – nie hardkoduj jej w komponentach. Waliduj plik schematem Zod przy starcie.
- UI po polsku, projektowany mobile-first pod iPhone’a (safe areas, duże elementy dotykowe, tryb jasny i ciemny). Ekran „Dziś” to najważniejszy widok – ma być czytelny w 5 sekund. Tryb siłowni: jedno ćwiczenie na ekranie, szybkie odhaczanie serii, automatyczny timer przerwy, Screen Wake Lock, działanie offline.
- Supabase: przygotuj migracje SQL z RLS dla wszystkich tabel ze specyfikacji, konfigurację lokalną (`supabase` CLI) i `.env.example`. Dostęp tylko dla jednego dozwolonego e-maila (magic link). Nie twórz projektu w chmurze ani nie wpisuj żadnych sekretów – daj mi instrukcję krok po kroku, co mam kliknąć i jakie zmienne ustawić.
- Sekrety Strava i Wahoo tylko w Edge Functions. Mam już aplikację deweloperską Wahoo w `~/code/wahoo-routes` – nie kopiuj stamtąd `.env`, tylko opisz, które wartości mam przenieść do sekretów Supabase.
- Po każdym etapie: uruchom lint, testy i build, sprawdź aplikację w przeglądarce w widoku iPhone (Playwright), zaktualizuj `CLAUDE.md` o komendy i strukturę projektu, zrób commit z opisem.
- Na końcu Etapu 1 daj mi instrukcję wdrożenia na Vercel (lub Netlify) i dodania aplikacji do ekranu początkowego iPhone’a.

Jeśli w dokumentacji znajdziesz sprzeczność lub brakującą informację, zapisz ją w `docs/OPEN_QUESTIONS.md` i zapytaj mnie, zamiast zgadywać.
