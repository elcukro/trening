# 22 · Instrukcja użytkownika (17.10.2026)

Instrukcja dla zawodnika (pierwsze uruchomienie, cztery kroki dnia, tydzień i zmiany planu, Strava, Bolt, maile,
Postęp, żywienie, siłownia, każda sekcja ustawień, pełna aplikacja, rozwiązywanie problemów) to statyczna strona
`public/pomoc.html` – dostępna w aplikacji jako **Pomoc** (pełna aplikacja: Więcej → Pomoc; `/i`: Więcej → sekcja Pomoc)
pod adresem `/pomoc.html`. Jest w precache (działa offline) i poza routerem SPA (`denylist` w `src/sw.ts`).
Strona ma własne style (jasny i ciemny motyw, jedna kolumna na telefonie, spis treści z boku od 900 px) i link
„Wróć do aplikacji”, bo w trybie ekranu początkowego nie ma paska przeglądarki.

Zasady treści: bez nazwisk, adresów i identyfikatorów; funkcje jednego programu oznaczone etykietą
(„program FTP 300”, „program alpejski”). Przy zmianie funkcji aplikacji zaktualizuj odpowiednią sekcję.
Kopia do wysłania bez logowania: artefakt opublikowany z tego samego pliku (link w rozmowie z 17.10.2026).


## Nowy wygląd (18.10.2026)
Sekcja `#nowy` opisuje mobilny v2 (`/m`, docs/24): karta stanu dnia, Plan z przytrzymaniem dnia, Ja, Trener. Przy zmianach w `/m` aktualizuj tę sekcję; sekcje o `/i` zostają do czasu usunięcia starego widoku.
