/** Wersja „dla człowieka” zasad z docs/01-zasady-treningu.md (§2, §5, §7). */
export interface Rule {
  id: string
  title: string
  text: string
}

export const RULES: Rule[] = [
  { id: 'R1', title: 'Pominięty środowy akcent', text: 'Przenieś na czwartek (zamiast Z2); piątkowa Sesja B wtedy lżejsza (−1 seria, RIR +1). Pominięty też w czwartek → przepada. Nigdy nie dokładaj akcentu w piątek/sobotę ani dwóch akcentów dzień po dniu.' },
  { id: 'R2', title: 'Pominięta sobotnia długa jazda', text: 'Przenieś na niedzielę (zastępuje niedzielny trening). Nie dokładaj w poniedziałek.' },
  { id: 'R3', title: 'Pominięta sesja siłowa', text: 'Sesja A → zrób w czwartek (po Z2 lub zamiast). Sesja B → przepada w tym tygodniu, nie przenoś na sobotę.' },
  { id: 'R4', title: 'Gołoledź, śnieg, poniżej −5 °C', text: 'Akcent → INDOOR_4x4 na Wattbike + siłownia. Z2 → 45–60 min na rowerku/wioślarzu lub marsz 60 min. Długa jazda → 90 min rowerek Z2 albo przesunięcie na drugi dzień weekendu.' },
  { id: 'R5', title: 'Choroba', text: 'Gorączka lub objawy „poniżej szyi” → zero treningu. Katar bez gorączki → tylko Z1 do 45 min, bez siłowni. Po ≥ 3 dniach przerwy: 2 dni krótkiego Z2. Po ≥ 7 dniach: powtórz poprzedni tydzień (w fazach I–III), w IV–V skróć zamiast przesuwać.' },
  { id: 'R6', title: 'Słaby poranny check-in', text: 'Tętno spoczynkowe > średnia 7-dniowa + 7 bpm dwa dni z rzędu albo suma ocen (sen + nogi + motywacja) ≤ 6 → obniż dzień: akcent → Z2 60 min, Sesja A/B → lżejsza (−1 seria, RIR +1).' },
  { id: 'R7', title: 'Rower ma pierwszeństwo', text: 'Jeśli 2 tygodnie z rzędu akcent „nie wyszedł” (RPE ≥ 9 przy niewykonanych celach), a ciężary rosną → −1 seria w Sesjach A i B do końca bloku.' },
  { id: 'R8', title: 'Progresja ciężarów', text: 'Wszystkie serie z zadanym RIR → +2,5 kg (sztanga; +5 kg przy RIR ≥ cel + 2), +1–2 kg na hantel. 1 seria z brakiem → ten sam ciężar. ≥ 2 serie z brakami drugi raz z rzędu → −10%. Mniej powtórzeń w nowym tygodniu → +2,5–5 kg. Rozładowanie: −10% ciężaru, −40% serii, RIR +1.' },
  { id: 'R9', title: '48 h ochrony', text: 'Brak Sesji A w ciągu 48 h przed testem, weekendem back-to-back, weekendem w górach i blokiem 3-dniowym. Przy naruszeniu: ostrzeżenie i propozycja przeniesienia Sesji A wcześniej lub zamiany na core.' },
  { id: 'R10', title: 'Tempo redukcji masy', text: 'Spadek > 1% masy/tydz. przez 2 tygodnie → +200–300 kcal. Spadek LTHR/FTP > 3% w teście przy redukcji → pauza w deficycie na 2 tygodnie. Waga ≤ cel → deficyt wyłączony.' },
  { id: 'R11', title: 'Nowy wynik testu', text: 'Strefy przeliczone od następnego dnia; aplikacja pokazuje różnicę względem poprzedniego testu i przypomina o ustawieniu stref w ELEMNT.' },
  { id: 'R12', title: 'Tydzień rozładowania', text: 'Rower: bez interwałów poza DELOAD_WED, objętość ok. −40%. Siła: −40% serii, −10% ciężaru, RIR +1.' },
  { id: 'R13', title: 'Upał > 28 °C', text: 'Cele tętna Z2–SS obniżone o 3–5 bpm, picie 750 ml/h + elektrolity, przy VO2 skróć do 4 powtórzeń.' },
  { id: 'R14', title: 'Zmiana daty wyjazdu', text: 'Kalendarz liczony od końca: taper = 2 ostatnie tygodnie, faza V = 6 tygodni przed taperem, faza IV wypełnia resztę od 26.04.2027. Fazy I–III przypięte do dat. Gdy na fazę IV zostaje < 6 tygodni, skracana jest faza III (tydzień testowy zostaje).' },
  { id: 'R15', title: 'Zamiana dni', text: 'Dozwolona w obrębie tygodnia. Walidacja: brak dwóch akcentów dzień po dniu, R9, poniedziałek wolny może zamienić się z czwartkiem.' },
  { id: 'R16', title: 'Skalowanie objętości', text: 'Ustawienie 0,7–1,0 skraca jazdy Z2, długie i pagórki (min. 45 min dla Z2, 90 min dla długiej). Akcenty, testy, góry i back-to-back bez zmian.' },
]

export const TESTS = [
  {
    id: 'TEST_LTHR',
    name: 'Test progowy terenowy (30 min)',
    when: 'tydz. 1, 7, 29, 37, 45 (środa)',
    protocol: '15 min rozgrzewki (z 2×20 s przyspieszeniami), 5 min luźno, 30 min maksymalnego równego wysiłku w pojedynkę, 10 min schłodzenia. Zawsze ta sama trasa, bez grupy. Pierwsze 5 min nie za mocno.',
    result: 'LTHR = średnie tętno z minut 10–30. Zapisz prędkość średnią, dystans, rower, temperaturę, wiatr.',
  },
  {
    id: 'WATTBIKE_TEST',
    name: 'Test na Wattbike (20 min)',
    when: 'tydz. 16 (środa) i 24 (wtorek)',
    protocol: '15 min rozgrzewki, 5 min luźno, 20 min all-out, 10 min schłodzenia.',
    result: 'FTP = 0,95 × średnia moc; LTHR ≈ 0,97 × średnie tętno z 20 min.',
  },
]

export const PASS_STRATEGY = [
  'Przełożenie 40/50: 7,5 km/h ≈ 72 rpm (przy 8,5 km/h ≈ 81 rpm).',
  'Pierwsze 2 km: 10–15 uderzeń poniżej LTHR. Kiedy inni odjeżdżają – ignoruj. Równe tempo wygrywa po 4. km.',
  'Jedzenie: 1 bidon izotoniku (~40 g węgli) + 1 żel (30–40 g) na godzinę wspinaczki, małe łyki co 10 min.',
  'Na podjazdach > 1 h: 500–750 ml płynu/h.',
  'Zjazdy: pozycja nisko, hamowanie pulsacyjne (mocno–puść), nigdy ciągłe. Patrz w wyjście z zakrętu.',
]

export const HIERARCHY = [
  'Środowy akcent rowerowy',
  'Sobotnia długa jazda (lub góry / back-to-back)',
  'Sesja siłowa A (C)',
  'Niedzielna jazda',
  'Sesja siłowa B',
  'Wtorkowe Z2',
  'Czwartkowe Z2',
]
