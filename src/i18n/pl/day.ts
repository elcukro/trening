import { plCount } from '../core'

/** Teksty: day (docs/34). Źródło prawdy – wersja angielska w `../en/day.ts` musi mieć te same klucze. */
export default {
  /** Skrzynka pod dzwonkiem (`inbox.ts`, arkusz w `/m`). */
  inbox: {
    title: 'Skrzynka',
    bell: 'Skrzynka',
    bellCount: (n: number) => `Skrzynka, do zrobienia: ${n}`,
    todo: 'Do zrobienia',
    fresh: 'Nowe',
    empty: 'Wszystko zrobione',
    emptySub: 'Prośby o ocenę jazdy, notatki trenera i nowe progi pojawią się tutaj.',
    sessionTitle: 'Zaloguj się ponownie',
    sessionSub: 'Sesja wygasła – jazdy i zmiany nie synchronizują się z kontem',
    syncTitle: 'Synchronizacja nie działa',
    checkinTitle: 'Poranny check-in',
    checkinSub: 'Sen, nogi i samopoczucie – 20 sekund',
    checkinWeigh: 'Sen, nogi i waga – dziś dzień ważenia',
    boltTitle: 'Wyślij plan na Bolta',
    boltStale: 'Plan dnia zmienił się po wysyłce',
    rpeTitle: 'Jak było? Oceń jazdę',
    ftpTitle: (w: number) => `Nowe FTP: ${w} W?`,
    ftpSub: (date: string) => `Z jazdy ${date} – zapisz w „Progi i miernik”`,
    weatherTitle: 'Ustaw miejscowość',
    weatherSub: 'Bez niej poranna odprawa nie pokaże pogody',
    noteTitle: (name: string) => `Notatka trenera: ${name}`,
    summaryTitle: (name: string) => `Podsumowanie: ${name}`,
    testTitle: 'Nowe progi z testu',
  },
  /** Kroki dnia (`dayState.ts` → `dayFlow`). */
  steps: {
    checkin: 'Poranny check-in',
    checkinDetail: 'Masa ciała, sen, nogi, motywacja – 20 sekund',
    bolt: 'Plan na Bolcie',
    boltSent: 'Wysłany – zsynchronizuj licznik',
    boltSend: 'Wyślij trening na licznik',
    log: 'Podsumowanie',
    logDetail: 'Jak poszło? Jedno dotknięcie',
  },
  /** TSB w ludzkich słowach (`formLabel`). */
  form: {
    rested: { text: 'Wypoczęty', hint: 'Dużo świeżości – można docisnąć' },
    fresh: { text: 'Świeży', hint: 'Dobry moment na mocny trening' },
    inForm: { text: 'W formie', hint: 'Równowaga między obciążeniem a odpoczynkiem' },
    tired: { text: 'Zmęczony', hint: 'Normalne w bloku – pilnuj snu' },
    overloaded: { text: 'Przeciążony', hint: 'Rozważ lżejszy dzień' },
  },
  /** Zgodność jazdy z planem (`rideVerdict`). */
  verdict: {
    onPlan: 'Zgodnie z planem',
    close: 'Blisko planu',
    off: 'Sporo odstępstw od planu',
    different: 'Inny trening niż zaplanowany',
  },
  /** Linia „co przyszło ze Zdrowia” (`health.ts`). */
  health: {
    weight: (kg: string) => `waga ${kg} kg`,
    restingHr: (bpm: number) => `tętno ${bpm}`,
    hrv: (ms: number) => `HRV ${ms} ms`,
    sleep: (time: string) => `sen ${time}`,
  },
  /** Wysyłka na Bolta z ekranu dnia (`useIos.ts`, `useCoach.ts`). */
  bolt: {
    sendError: 'błąd wysyłki',
    unknownError: 'nieznany błąd',
    localOnly: 'Ta wersja aplikacji działa bez serwera – wysyłka na Bolta jest niedostępna.',
    noDay: 'Tego dnia nie ma w planie.',
    nothingToSend: 'Tego dnia nie ma czego wysłać.',
    notConnected: 'Wahoo nie jest połączone. Połącz je w Ustawieniach → Integracje.',
    planNotLinked: 'Trening jest na Wahoo, ale bez planu kroków. Wyślij go jeszcze raz.',
    dayError: (date: string, error: string) => `${date}: ${error}`,
  },
  /**
   * Wyniki narzędzi trenera (`coachTools.ts`) – widzi je zawodnik w czacie i model w rozmowie. Daty zostają
   * w formacie ISO (jednoznaczne dla modelu).
   */
  tools: {
    badDate: 'Zła data – podaj ją w formacie RRRR-MM-DD.',
    weight: (kg: string) => `waga ${kg} kg`,
    restingHr: (bpm: number) => `tętno ${bpm}`,
    rating: { sleep: 'sen', legs: 'nogi', motivation: 'motywacja' },
    sickYes: 'choroba: tak',
    sickNo: 'choroba: nie',
    notes: (text: string) => `uwagi: „${text}”`,
    noFields: 'Brak poprawnych pól (waga 40–200 kg, tętno 30–120, oceny 1–5).',
    checkinSaved: (date: string, fields: string) => `Zapisano check-in ${date}: ${fields}.`,
    rpeRange: 'RPE musi być liczbą 1–10.',
    rpeSaved: (rpe: number, date: string, withNote: boolean) => `Zapisano RPE ${rpe} dla ${date}${withNote ? ' z notatką' : ''}.`,
    outsideWindow: (date: string) => `Dnia ${date} nie ma w oknie planu (±7 dni).`,
    restDay: (date: string) => `${date} to dzień wolny – nie ma czego pomijać.`,
    skipped: (date: string, name: string, reason: string | null) => `Oznaczono ${date} (${name}) jako pominięte${reason ? `: ${reason}` : ''}.`,
    moveDates: 'Podaj daty „from” i „to” w formacie RRRR-MM-DD.',
    nothingToMove: (date: string) => `${date} nie ma jazdy do przeniesienia.`,
    cantMove: (reason: string | null) => `Nie można przenieść: ${reason ?? 'nie pozwalają na to reguły planu'}.`,
    moved: (name: string, from: string, to: string, warning: string | null) =>
      `Przeniesiono „${name}” z ${from} na ${to}.${warning ? ` Uwaga: ${warning}` : ''} Plan na Bolcie wymaga ponownej wysyłki.`,
    pushPartial: (n: number, errors: string) => `Wysłano ${plCount(n, 'dzień', 'dni', 'dni')}, błędy: ${errors}.`,
    pushed: (n: number) => `Wysłano plan na Bolta (${plCount(n, 'dzień', 'dni', 'dni')}).`,
    unknownTool: (name: string) => `Nieznane narzędzie ${name}.`,
  },
  /**
   * Podpowiedzi nad klawiaturą w rozmowie z trenerem (`coachChips.ts`): `label` na przycisku, `send` – wiadomość
   * wysyłana od razu, `prefill` – początek wiadomości do dokończenia (kończy się spacją).
   */
  chips: {
    askWeek: { label: 'Co w tym tygodniu?', send: 'Co mnie czeka w tym tygodniu?' },
    lastRide: { label: 'Jak wyszła ostatnia jazda?', send: 'Jak wyszła moja ostatnia jazda?' },
    cantTomorrow: { label: 'Jutro nie dam rady', prefill: 'Jutro nie dam rady jechać, bo ' },
    tomorrowLabel: 'Co jutro?',
    tomorrowSend: (ride: string | null) => (ride ? `Co mnie czeka jutro (${ride})?` : 'Co mnie czeka jutro?'),
    form: { label: 'Jak moja forma?', send: 'Jak oceniasz moją formę w ostatnich dwóch tygodniach?' },
    weight: { label: 'Jak idzie z wagą?', send: 'Jak idzie z wagą względem celu?' },
    moveRide: { label: 'Przenieś jazdę…', prefill: 'Przenieś jazdę z ' },
    bolt: { label: 'Wyślij na Bolta', send: 'Wyślij plan na Bolta' },
    hurts: { label: 'Coś mnie boli', prefill: 'Boli mnie ' },
    weighLabel: (kg: string | null) => (kg ? `Waga ${kg}…` : 'Waga…'),
    weighPrefill: (kg: string | null) => (kg ? `Waga ${kg}, tętno ` : 'Waga '),
    sleptBadly: { label: 'Słaby sen, ciężkie nogi', send: 'Sen słaby, nogi ciężkie' },
    sleptWell: { label: 'Dobry sen, lekkie nogi', send: 'Sen dobry, nogi lekkie, motywacja pełna' },
    sick: { label: 'Choruję', prefill: 'Choruję: ' },
    clothing: { label: 'Jak się dziś ubrać?', send: 'Jak się dziś ubrać na jazdę?' },
    watchOutLabel: 'Na co uważać?',
    watchOutSend: (ride: string | null) => (ride ? `Na co uważać dziś w treningu „${ride}”?` : 'Na co uważać dziś w treningu?'),
    rpe: { label: 'RPE…', prefill: 'RPE ' },
    howWasIt: { label: 'Jak wyszło?', send: 'Jak wyszła dzisiejsza jazda?' },
    wasHard: { label: 'Było ciężko', send: 'Było ciężko, nogi padły w drugiej połowie' },
    moveTomorrow: { label: 'Przenieś jutro na…', prefill: 'Przenieś jutrzejszą jazdę na ' },
    wantToRide: { label: 'Chcę dziś pojechać', send: 'Mam dziś wolne, ale chcę pojechać – co proponujesz?' },
    makeUp: { label: 'Odrobić w tym tygodniu?', send: 'Dzisiejszy trening odpadł – odrobić go w tym tygodniu?' },
  },
}
