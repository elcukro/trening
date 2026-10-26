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
`public/pomoc.html` jest przepisana pod mobilny v2 (docs/24): treść uporządkowana według ekranów `/m` (start, nawigacja,
Dziś – karta dnia, jazda i podsumowanie, Plan z przytrzymaniem dnia, Trener, Ja, Strava, Bolt, maile, żywienie, komputer,
problemy) i wygląd jak ekran aplikacji – te same tokeny co `src/m/m.css`, karty, wiersze z ikonami 3D z `public/m/art`,
pasek „Wróć”, tylko jasny motyw. Stary widok `/i` ma w pomocy jedno zdanie (zapas pod przełącznikiem). Przy zmianach w `/m`
aktualizuj odpowiednią sekcję; przy nowej ikonie w `public/m/art` można jej użyć w wierszu pomocy.

**Aplikacja iOS (26.10.2026, docs/26):** ta sama strona ma wariant „w aplikacji” – klasa `in-app` na `<html>` (gdy jest
`window.Capacitor`) chowa elementy `.only-web` (Safari, ekran początkowy, pełna aplikacja na telefonie, Web Push)
i pokazuje `.only-app`. Nowy tekst o przeglądarce albo pełnej aplikacji dostaje `only-web` i, jeśli trzeba, odpowiednik
`only-app`. Kroki „Pierwsze uruchomienie” są numerowane licznikiem CSS (`.steps`), więc ukryty krok nie zostawia luki.
