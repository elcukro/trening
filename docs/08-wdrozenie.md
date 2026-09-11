# 08 · Wdrożenie (Etap 1) i instalacja na iPhonie

## 1. Repozytorium na GitHubie
```bash
cd ~/code/trening
gh repo create trening --private --source=. --push
```
(albo utwórz repozytorium w przeglądarce i `git remote add origin … && git push -u origin main`). CI (`.github/workflows/ci.yml`) uruchomi lint, testy, build i E2E przy każdym pushu.

## 2. Vercel
1. Wejdź na https://vercel.com/new, zaloguj się przez GitHub i wybierz repozytorium `trening`.
2. Ustawienia projektu (Vercel wykryje Vite automatycznie):
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm ci`
   - Node.js Version: 24.x (Settings → General)
3. Zmiennych środowiskowych w Etapie 1 **nie ma** – aplikacja działa w całości lokalnie. W Etapie 2 dojdą `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` (klucz publiczny, można go trzymać w Vercel).
4. Kliknij **Deploy**. Po ~1 min dostaniesz adres `https://trening-….vercel.app` (HTTPS jest wymagane dla PWA).
5. Plik `vercel.json` w repozytorium ustawia przekierowanie tras React Routera na `index.html` i wyłącza cache dla `sw.js`, żeby aktualizacje aplikacji docierały od razu.

Alternatywa – Netlify: to samo (build `npm run build`, publish `dist`), dodatkowo plik `_redirects` z linią `/* /index.html 200`.

## 3. Dodanie do ekranu początkowego iPhone'a
1. Otwórz adres aplikacji w **Safari** (nie w Chrome – tylko Safari instaluje PWA na iOS).
2. Dotknij ikony **Udostępnij** (kwadrat ze strzałką) → **Do ekranu początkowego** → **Dodaj**.
3. Uruchamiaj aplikację z ikony na ekranie początkowym – działa na pełnym ekranie, bez paska Safari, i po pierwszym otwarciu **offline** (dane programu są w pamięci podręcznej).
4. Aktualizacje: aplikacja sama pobiera nową wersję przy kolejnym uruchomieniu (service worker `autoUpdate`). Jeśli widzisz starą wersję, zamknij ją całkowicie (przesuń w górę w przełączniku aplikacji) i otwórz ponownie.

## 4. Pierwsze uruchomienie
1. **Więcej → Ustawienia**: potwierdź masę startową (105 kg domyślnie), datę wyjazdu (11.09.2027) i dni siłowni.
2. Po środowym teście (16.09.2026) wpisz **LTHR** – cele na ekranie Dziś zmienią się z RPE na bpm.
3. Jeśli tygodnie w pracy są cięższe, obniż **skalę objętości** (R16) – skróci Z2, długie jazdy i pagórki, nie ruszając akcentów, testów i gór.

## 5. Sprawdzenie na telefonie
- Dziś (16.09.2026): tydzień 1, faza I, test; TEST_LTHR 60 min; Sesja A z przysiadem 2×10 RIR 4; „bez deficytu”.
- Tryb samolotowy → aplikacja nadal otwiera Dziś, Tydzień i Bibliotekę.
