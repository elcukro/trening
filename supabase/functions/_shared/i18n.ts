/**
 * Teksty serwera w dwóch językach (docs/34 § 6): maile, push, strony potwierdzeń, komunikaty błędów dla aplikacji,
 * notatki i listy „z reguł”, podpis na Stravie. Czysty TS bez Deno i bez `src/` – działa w Edge Functions i w Vitest.
 *
 * Polski jest źródłem; angielski ma ten sam kształt (`Dict`) – brak albo nadmiar klucza to błąd typów.
 * Język to zawsze jawny parametr (`lang`): jedna funkcja obsługuje wielu zawodników, więc nie ma „bieżącego” języka.
 * Prompty dla modeli zostają po polsku jako instrukcja; `aiLangRule(lang)` dopisuje, w jakim języku ma być odpowiedź.
 */

export type Lang = 'pl' | 'en'

export function isLang(v: unknown): v is Lang {
  return v === 'pl' || v === 'en'
}

/** Pola profilu, z których czytamy język (`profiles.locale`, `profiles.language`). */
export interface LangProfile {
  locale?: string | null
  language?: string | null
}

/**
 * Język zawodnika: `locale` (język, w którym aplikacja ostatnio się wyświetlała) → `language` (wybór w Ustawieniach,
 * gdy to `pl`/`en`, a nie `system`) → polski (konta sprzed docs/34).
 */
export function langOf(profile: LangProfile | null | undefined): Lang {
  if (isLang(profile?.locale)) return profile.locale
  if (isLang(profile?.language)) return profile.language
  return 'pl'
}

/** Pierwszy obsługiwany język z nagłówka Accept-Language (`en-GB,pl;q=0.8` → `en`). */
function acceptLang(header: string | null): Lang | null {
  for (const part of (header ?? '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase()
    if (isLang(code)) return code
  }
  return null
}

/**
 * Język odpowiedzi na żądanie: nagłówek `x-app-lang` (aplikacja wysyła język, w którym właśnie się wyświetla) →
 * profil (`langOf`). Bez profilu (np. kliknięcie w link z maila bez rozpoznanego konta) – Accept-Language przeglądarki.
 */
export function langFromRequest(req: { headers: { get(name: string): string | null } }, profile?: LangProfile | null): Lang {
  const h = req.headers.get('x-app-lang')?.trim().toLowerCase()
  if (isLang(h)) return h
  if (profile) return langOf(profile)
  return acceptLang(req.headers.get('accept-language')) ?? 'pl'
}

/** Locale dla `Intl`: angielski brytyjski – tydzień od poniedziałku, daty dzień-miesiąc (jak w aplikacji). */
export function intlLocale(lang: Lang): string {
  return lang === 'pl' ? 'pl-PL' : 'en-GB'
}

const rules = new Map<Lang, Intl.PluralRules>()
function pluralRule(lang: Lang): Intl.PluralRules {
  let r = rules.get(lang)
  if (!r) rules.set(lang, (r = new Intl.PluralRules(intlLocale(lang))))
  return r
}

/** Polska odmiana: 1 jazda, 2 jazdy, 5 jazd; ułamki → `few`. Zwraca samo słowo. */
export function plWord(n: number, one: string, few: string, many: string): string {
  const c = pluralRule('pl').select(n)
  return c === 'one' ? one : c === 'few' || c === 'other' ? few : many
}

/** Angielska odmiana: 1 ride, 2 rides. */
export function enWord(n: number, one: string, other: string): string {
  return pluralRule('en').select(n) === 'one' ? one : other
}

/** Liczba z ustaloną liczbą miejsc po przecinku i separatorem języka (bez grupowania tysięcy – jak dotąd w mailach). */
export function fix(x: number, digits: number, lang: Lang): string {
  const s = x.toFixed(digits)
  return lang === 'pl' ? s.replace('.', ',') : s
}

/** „26.10.2026” / „26 Oct 2026” z daty ISO (bez strefy – data kalendarzowa). */
export function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return lang === 'pl'
    ? new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
}

const mm = (m: number) => String(m).padStart(2, '0')
const monShort = (d: Date) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d)

/** Etykieta tygodnia z poniedziałku: „12–18.10” (pl, jak w faktach) / „12–18 Oct” (en). */
export function weekRange(monday: string, lang: Lang): string {
  const a = new Date(`${monday}T12:00:00Z`)
  const b = new Date(a.getTime() + 6 * 86_400_000)
  if (lang === 'pl') {
    const m1 = a.getUTCMonth() + 1
    const m2 = b.getUTCMonth() + 1
    return m1 === m2 ? `${a.getUTCDate()}–${b.getUTCDate()}.${mm(m2)}` : `${a.getUTCDate()}.${mm(m1)}–${b.getUTCDate()}.${mm(m2)}`
  }
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${monShort(b)}` : `${a.getUTCDate()} ${monShort(a)} – ${b.getUTCDate()} ${monShort(b)}`
}

/** Nazwa dnia tygodnia z daty ISO, małą literą jak w faktach (`poniedziałek` / `Monday`). */
export function weekdayOf(iso: string, lang: Lang): string {
  return strings(lang).weekdays[new Date(`${iso}T00:00:00Z`).getUTCDay()]!
}

/**
 * Dopisek do promptu: w jakim języku ma być odpowiedź modelu. Dla polskiego pusty – prompty i tak są po polsku.
 * Liczby bez separatora tysięcy, bo weryfikacja liczb (`numbersOk`) czyta „2,400” jako 2,4.
 */
export function aiLangRule(lang: Lang): string {
  return lang === 'pl'
    ? ''
    : 'JĘZYK ODPOWIEDZI: zawodnik używa aplikacji po angielsku. Odpowiadaj wyłącznie po angielsku (naturalnie, jak trener z UK/USA), mimo że instrukcje i etykiety faktów są po polsku. Liczby dziesiętne pisz z kropką (8.7 %, 0.75), nie z przecinkiem, i bez separatora tysięcy (2400 m, nie 2,400 m). Reguły o przecinku dziesiętnym i o języku polskim z instrukcji wyżej nie obowiązują.'
}

// ---------------------------------------------------------------- słownik

const pl = {
  appName: 'Bicycle Coach',
  htmlLang: 'pl',
  weekdays: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],

  mail: {
    footerOpenApp: 'otwórz aplikację',
    footerUnsubscribe: 'wyłącz te maile',
    /** przedrostek tematu maila próbnego (Ustawienia → „Wyślij próbny”) */
    samplePrefix: '[PRÓBA] ',
    of: (done: string, planned: string) => `${done} z ${planned}`,
    outOf: (planned: string) => `z ${planned}`,
    total: 'Razem',
    seeInApp: 'Zobacz w aplikacji',
    rides: (n: number) => `${n} ${plWord(n, 'jazda', 'jazdy', 'jazd')}`,
    rpeLegend: '1–3 lekko · 4–6 średnio · 7–8 ciężko · 9–10 na granicy. Jedno kliknięcie zapisuje ocenę w dzienniku.',
    morning: {
      restTitle: 'Dzień wolny',
      subject: (name: string, duration: string) => `Dziś: ${name} · ${duration}`,
      subjectRest: 'Dziś odpoczynek',
      keyDay: 'akcent',
      duration: 'czas',
      bike: 'rower',
      openPlan: 'Otwórz dzisiejszy plan',
      steps: 'Kroki',
      food: 'Jedzenie',
      foodLine: (label: string) => `Jedzenie: ${label}`,
      onBike: 'na rowerze',
      protein: 'białko',
      afterRide: 'po treningu',
      remember: 'Pamiętaj',
      legsToday: (n: number) => `Nogi dziś: ${n}/5`,
      legsAsk: 'Jak nogi dziś?',
      legsAskText: 'Jak nogi dziś? Kliknij 1–5:',
      legsLegend: '1 ciężkie · 3 zwyczajne · 5 lekkie. Jedno kliknięcie zapisuje ocenę w porannym check-inie; masę i tętno dopisz w aplikacji.',
    },
    workout: {
      subjectDay: (rides: string, duration: string) => `Dzień w liczbach: ${rides} · ${duration}`,
      subjectDone: (name: string, value: string) => `Zrobione: ${name} · ${value}`,
      eyebrowDay: 'dzień w liczbach',
      eyebrowDone: 'trening wykonany',
      textDone: 'zrobione',
      planned: (name: string, duration: string) => `w planie: ${name}, ${duration}`,
      ridesOfDay: 'Jazdy dnia',
      coachNote: 'Notatka trenera',
      hrZones: 'Czas w strefach tętna',
      rpeCurrent: (n: number) => `Twoja ocena: RPE ${n}`,
      rpeAsk: 'Jak ciężko było? (RPE)',
      rpeAskText: 'Jak ciężko było? Kliknij RPE:',
      insights: 'Co widać w danych',
      next: 'Następny',
    },
    weekly: {
      subject: (week: string) => `Tydzień ${week}`,
      eyebrow: (week: string) => `List trenera · tydzień ${week}`,
      title: (athlete: string) => (athlete ? `${athlete}, tak minął tydzień` : 'Tak minął tydzień'),
      byDay: 'Dzień po dniu',
      body: 'Ciało',
      weight: 'masa',
      restingHr: 'tętno spoczynkowe',
      legs: 'nogi',
      seeReport: 'Zobacz raport tygodnia',
      next: (duration: string, deload: boolean) => `Następny tydzień · ${duration}${deload ? ' · rozładowanie' : ''}`,
      outcome: { done: 'zrobione', modified: 'inaczej', skipped: 'odpuszczone', missed: 'bez jazdy', extra: 'poza planem', free: 'wolne' },
    },
    /** Podsumowanie jazdy (`buildWorkoutView`). */
    view: {
      movingTime: 'czas jazdy',
      distance: 'dystans',
      np: 'moc znormalizowana',
      avgPower: 'średnia moc',
      avgHr: 'średnie tętno',
      tssPower: 'TSS (z mocy)',
      tssHr: 'TSS (z tętna)',
      intensity: 'intensywność (IF)',
      cadence: 'kadencja',
      elevation: 'przewyższenie',
      thisWeek: 'Ten tydzień',
      unplanned: 'Jazda poza planem – policzona do obciążenia tygodnia',
      asPlanned: 'Zrobione zgodnie z planem',
      notDone: (pct: number) => `Zaplanowany trening niewykonany – ta jazda to ${pct} % planu`,
      shortened: (pct: number) => `Skrócony trening – ${pct} % zaplanowanego czasu`,
      shorter: (pct: number) => `Krócej niż w planie (${pct} %)`,
      longer: (pct: number) => `Dłużej niż w planie (${pct} %)`,
      ifEasy: (v: string) => `IF ${v} – spokojnie, tak jak ma być na jeździe tlenowej.`,
      ifHard: (v: string, limit: string) => `IF ${v} – jak na spokojną jazdę za mocno; Z2 kończy się ok. ${limit}.`,
      driftLow: (v: string) => `Dryf tętna względem mocy ${v} % – baza tlenowa trzyma (poniżej 5 %).`,
      driftMid: (v: string) => `Dryf tętna względem mocy ${v} % – w drugiej połowie tętno uciekało; zjedz i napij się wcześniej, a tempo trzymaj równiej.`,
      driftHigh: (v: string) => `Dryf tętna względem mocy ${v} % – duży. Zmęczenie, upał albo za mało jedzenia; ta intensywność to jeszcze nie Twoje Z2 na tak długo.`,
      lowCadence: (avg: number, floor: number) => `Średnia kadencja ${avg} rpm – poniżej progu ${floor} rpm.`,
      manyRides: (n: number) => `${n} ${plWord(n, 'jazda', 'jazdy', 'jazd')} jednego dnia – każda liczy się do obciążenia; jeśli to był dzień akcentu, reszta dnia miała być lekka.`,
    },
  },

  /** Strony po kliknięciu w link z maila (RPE, nogi, wypisanie). */
  pages: {
    openApp: 'Otwórz aplikację',
    emailSettings: (url: string) => `Ustawienia maili: ${url}`,
    unsubscribed: (what: string) => `Wyłączone: ${what}. Włączysz je z powrotem w Ustawieniach.`,
    kinds: { morning: 'poranna odprawa', workout: 'podsumowanie po treningu', weekly: 'list tygodnia' },
    invalidLink: 'Link jest nieprawidłowy albo wygasł.',
    badLinkTitle: 'Link nieprawidłowy',
    badLinkText: 'Ten link jest uszkodzony albo pochodzi z innego konta.',
    notSavedTitle: 'Nie zapisano',
    reasons: { expired: 'link jest już nieaktualny', no_ride: 'tego dnia nie ma zapisanej jazdy', db: 'błąd zapisu – spróbuj później w aplikacji' },
    rpeFailed: (rpe: number, date: string, reason: string) => `RPE ${rpe} z ${date}: ${reason}.`,
    rpeSavedTitle: (rpe: number) => `Zapisano RPE ${rpe}`,
    rpeSavedText: (date: string) => `Ocena jazdy z ${date} trafiła do dziennika. Żeby ją zmienić, kliknij w mailu inną liczbę.`,
    legsFailed: (legs: number, date: string, reason: string) => `Nogi ${legs}/5 z ${date}: ${reason}.`,
    legsSavedTitle: (legs: number) => `Zapisano: nogi ${legs}/5`,
    legsSavedText: (date: string) => `Check-in z ${date} ma ocenę nóg. Masę, tętno spoczynkowe i sen dopisz w aplikacji.`,
  },

  push: {
    morningTitle: 'Plan na dziś',
    morningBody: 'Zobacz dzisiejszy trening i odprawę: pogoda, ubiór, jedzenie.',
    eveningTitle: 'Odhacz dzisiejszy trening',
    eveningBody: 'Wpisz RPE i jedno zdanie o jeździe – zajmie 20 sekund.',
    boltStale: 'Otwórz aplikację – treningi na Bolcie od dawna nie były odświeżane.',
    weeklyTitle: 'Przegląd tygodnia',
    weeklyBody: 'Godziny, TSS, co się udało i co czeka w przyszłym tygodniu.',
    testBody: 'Powiadomienia działają.',
  },

  /** Komunikaty błędów, które aplikacja pokazuje zawodnikowi wprost (pole `error` w odpowiedzi). */
  errors: {
    aiUnavailable: 'Trener AI jest chwilowo niedostępny – spróbuj później.',
    monthlyLimit: 'Miesięczny limit AI jest wyczerpany – odnowi się na początku miesiąca.',
    dailyLimitCheckin: 'Dzienny limit jest wyczerpany – spróbuj jutro albo wpisz pola ręcznie.',
    dailyLimitChat: 'Dzienny limit rozmów jest wyczerpany – spróbuj jutro.',
    dailyLimitMeal: 'Dzienny limit jest wyczerpany – spróbuj jutro albo wpisz posiłek ręcznie.',
    dailyLimitLetter: 'Dzienny limit próbnych listów jest wyczerpany – spróbuj jutro.',
    mealImages: 'Wyślij 1–2 zdjęcia (każde do ok. 1,5 MB).',
    dietOff: 'Jedzenie jest wyłączone na tym koncie.',
    mealUnrecognized: 'Nie udało się rozpoznać posiłku – spróbuj innego zdjęcia.',
    wahooRateSkipped: 'pominięte – wyczerpany limit zapytań Wahoo',
    badReturn: 'Nieprawidłowy adres powrotu – zacznij logowanie od nowa w aplikacji.',
  },

  /** Tytuł i opis jazdy na Stravie (`strava_title.ts`). */
  strava: {
    signature: 'Notatki: Bicycle Coach',
    ftpTest: 'Test FTP',
    unplannedTitle: 'Jazda poza planem',
    planLine: (name: string, planned: number, done: number) => `Plan: ${name}, ${planned} min. Wykonane ${done} min.`,
    unplannedLine: (min: number) => `Poza planem, ${min} min.`,
    avgLine: (w: string, hr: string) => `Średnio ${w} W przy ${hr} bpm.`,
  },

  /** Notatka trenera z reguł (`ruleNote`), gdy model niedostępny albo szkic nie przeszedł weryfikacji. */
  note: {
    test: (best20: number, ftp: number) => `Test zrobiony: najlepsze 20 minut to ${best20} W, czyli FTP ok. ${ftp} W.`,
    testEven: (blocks: string) => `Rozłożenie sił bardzo równe (${blocks} W).`,
    testUneven: (blocks: string) => `Bloki 5-minutowe: ${blocks} W – następnym razem spróbuj równiej od startu.`,
    intervals: (inTarget: number, total: number, lo: number, hi: number, plan: string | null) => `${inTarget} z ${total} interwałów w zakresie ${lo}–${hi} W${plan ? ` (plan: ${plan})` : ''}.`,
    fadeOk: 'Ostatni interwał nie słabszy od pierwszego – dobrze rozłożone siły.',
    fade: (pct: number) => `Ostatni interwał o ${pct} % słabszy od pierwszego – następnym razem pierwszy spokojniej.`,
    easyOk: (v: string, min: number) => `Spokojnie, tak jak trzeba: IF ${v} przez ${min} min.`,
    easyHard: (v: string, limit: string) => `Jak na spokojną jazdę za mocno: IF ${v} – Z2 kończy się ok. ${limit}.`,
    plain: (min: number, km: string) => `${min} min jazdy, ${km} km.`,
    driftOk: (v: string) => `Dryf tętna ${v} % – baza tlenowa trzyma.`,
    driftHigh: (v: string) => `Dryf tętna ${v} % – w drugiej połowie tętno uciekało, zjedz i napij się wcześniej.`,
    record: (span: string, watts: number) => `Najlepsze ${span} od 90 dni: ${watts} W.`,
    minutes: (n: number) => `${n} min`,
    seconds: (n: number) => `${n} s`,
  },

  /** List tygodnia z reguł (`ruleLetter`). */
  letter: {
    done: (week: string, done: string, planned: string, pct: number | null, rides: number, km: number) =>
      `W tygodniu ${week} zrobiłeś ${done} z ${planned} planu${pct != null ? ` (${pct} %)` : ''}, ${rides} ${plWord(rides, 'jazdę', 'jazdy', 'jazd')}, ${km} km.`,
    stravaOnly: (n: number) =>
      `${n === 1 ? '1 jazda jest' : `${n} ${plWord(n, 'jazda', 'jazdy', 'jazd')} ${plWord(n, 'jest', 'są', 'jest')}`} tylko na Stravie – list ich nie omawia, ale widzisz je w aplikacji.`,
    doneNoPlan: (week: string, done: string, rides: number, km: number) => `W tygodniu ${week} zrobiłeś ${done} w ${rides} ${plWord(rides, 'jeździe', 'jazdach', 'jazdach')}, ${km} km.`,
    keyAll: 'Akcenty tygodnia wykonane.',
    keySome: (done: number, planned: number) => `Z akcentów tygodnia wykonane ${done} z ${planned}.`,
    missed: (n: number) => `${n === 1 ? 'Jeden trening wypadł' : `${n} ${plWord(n, 'trening wypadł', 'treningi wypadły', 'treningów wypadło')}`} bez oznaczenia – jeśli to decyzja, oznacz dzień jako pominięty.`,
    volume: (up: boolean, pct: number) => `Względem poprzedniego tygodnia objętość ${up ? 'wzrosła' : 'spadła'} o ${pct} %.`,
    weight: (kg: string, change: string | null) => `Masa ${kg} kg${change ? ` (${change} kg)` : ''}.`,
    rhr: (bpm: string, change: string | null) => `Tętno spoczynkowe średnio ${bpm} bpm${change ? `, ${change} względem poprzedniego tygodnia` : ''}.`,
    legs: (v: string) => `Nogi średnio ${v}/5.`,
    noCheckins: 'Bez check-inów w tym tygodniu – nie widzę masy ani samopoczucia.',
    flag: (text: string) => `Uwaga: ${text}.`,
    /** Flagi z `weekFacts` są po polsku (fakty dla modelu) – tu tylko tłumaczenie do listu z reguł. */
    flags: {} as Record<string, string>,
    next: (n: number, duration: string, key: string | null) => `Następny tydzień: ${n} ${plWord(n, 'trening', 'treningi', 'treningów')}, ${duration}${key ? `, najważniejszy: ${key}` : ''}.`,
    nextTest: 'W planie jest test – ostatnie dni przed nim lekko, na świeżo.',
  },
}

export type Dict = typeof pl

const en: Dict = {
  appName: 'Bicycle Coach',
  htmlLang: 'en',
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

  mail: {
    footerOpenApp: 'open the app',
    footerUnsubscribe: 'turn off these emails',
    samplePrefix: '[TEST] ',
    of: (done, planned) => `${done} of ${planned}`,
    outOf: (planned) => `of ${planned}`,
    total: 'Total',
    seeInApp: 'View in the app',
    rides: (n) => `${n} ${enWord(n, 'ride', 'rides')}`,
    rpeLegend: '1–3 easy · 4–6 moderate · 7–8 hard · 9–10 all-out. One tap saves it to your log.',
    morning: {
      restTitle: 'Rest day',
      subject: (name, duration) => `Today: ${name} · ${duration}`,
      subjectRest: 'Today: rest',
      keyDay: 'key session',
      duration: 'duration',
      bike: 'bike',
      openPlan: "Open today's plan",
      steps: 'Steps',
      food: 'Food',
      foodLine: (label) => `Food: ${label}`,
      onBike: 'on the bike',
      protein: 'protein',
      afterRide: 'after the ride',
      remember: 'Remember',
      legsToday: (n) => `Legs today: ${n}/5`,
      legsAsk: 'How are your legs today?',
      legsAskText: 'How are your legs today? Tap 1–5:',
      legsLegend: '1 heavy · 3 normal · 5 fresh. One tap saves it to your morning check-in; add weight and heart rate in the app.',
    },
    workout: {
      subjectDay: (rides, duration) => `Your day in numbers: ${rides} · ${duration}`,
      subjectDone: (name, value) => `Done: ${name} · ${value}`,
      eyebrowDay: 'day in numbers',
      eyebrowDone: 'workout done',
      textDone: 'done',
      planned: (name, duration) => `planned: ${name}, ${duration}`,
      ridesOfDay: "Today's rides",
      coachNote: "Coach's note",
      hrZones: 'Time in heart-rate zones',
      rpeCurrent: (n) => `Your rating: RPE ${n}`,
      rpeAsk: 'How hard was it? (RPE)',
      rpeAskText: 'How hard was it? Tap your RPE:',
      insights: 'What the data shows',
      next: 'Next',
    },
    weekly: {
      subject: (week) => `Week ${week}`,
      eyebrow: (week) => `Coach's letter · week ${week}`,
      title: (athlete) => (athlete ? `${athlete}, here's how your week went` : "Here's how your week went"),
      byDay: 'Day by day',
      body: 'Body',
      weight: 'weight',
      restingHr: 'resting HR',
      legs: 'legs',
      seeReport: 'View the weekly report',
      next: (duration, deload) => `Next week · ${duration}${deload ? ' · recovery week' : ''}`,
      outcome: { done: 'done', modified: 'changed', skipped: 'skipped', missed: 'no ride', extra: 'unplanned', free: 'rest' },
    },
    view: {
      movingTime: 'moving time',
      distance: 'distance',
      np: 'normalized power',
      avgPower: 'average power',
      avgHr: 'average HR',
      tssPower: 'TSS (power)',
      tssHr: 'TSS (heart rate)',
      intensity: 'intensity (IF)',
      cadence: 'cadence',
      elevation: 'elevation gain',
      thisWeek: 'This week',
      unplanned: "Unplanned ride – counted towards this week's load",
      asPlanned: 'Done as planned',
      notDone: (pct) => `Planned workout not done – this ride was ${pct} % of the plan`,
      shortened: (pct) => `Shortened workout – ${pct} % of the planned time`,
      shorter: (pct) => `Shorter than planned (${pct} %)`,
      longer: (pct) => `Longer than planned (${pct} %)`,
      ifEasy: (v) => `IF ${v} – easy, exactly right for an endurance ride.`,
      ifHard: (v, limit) => `IF ${v} – too hard for an easy ride; zone 2 tops out around ${limit}.`,
      driftLow: (v) => `Heart-rate drift vs power ${v} % – your aerobic base is holding (under 5 %).`,
      driftMid: (v) => `Heart-rate drift vs power ${v} % – your heart rate crept up in the second half; eat and drink earlier and keep the pace steadier.`,
      driftHigh: (v) => `Heart-rate drift vs power ${v} % – high. Fatigue, heat or too little food; this intensity isn't your zone 2 for that long yet.`,
      lowCadence: (avg, floor) => `Average cadence ${avg} rpm – below your ${floor} rpm floor.`,
      manyRides: (n) => `${n} ${enWord(n, 'ride', 'rides')} in one day – each one adds to your load; if it was a key-session day, the rest of the day should have been easy.`,
    },
  },

  pages: {
    openApp: 'Open the app',
    emailSettings: (url) => `Email settings: ${url}`,
    unsubscribed: (what) => `Turned off: ${what}. You can turn it back on in Settings.`,
    kinds: { morning: 'morning briefing', workout: 'ride summary', weekly: 'weekly letter' },
    invalidLink: 'This link is invalid or has expired.',
    badLinkTitle: 'Invalid link',
    badLinkText: 'This link is broken or belongs to another account.',
    notSavedTitle: 'Not saved',
    reasons: { expired: 'the link has expired', no_ride: 'no ride recorded that day', db: "couldn't save – try again later in the app" },
    rpeFailed: (rpe, date, reason) => `RPE ${rpe} for ${date}: ${reason}.`,
    rpeSavedTitle: (rpe) => `RPE ${rpe} saved`,
    rpeSavedText: (date) => `Your rating for the ride on ${date} is in your log. To change it, tap a different number in the email.`,
    legsFailed: (legs, date, reason) => `Legs ${legs}/5 for ${date}: ${reason}.`,
    legsSavedTitle: (legs) => `Saved: legs ${legs}/5`,
    legsSavedText: (date) => `Your check-in for ${date} now has a legs rating. Add weight, resting heart rate and sleep in the app.`,
  },

  push: {
    morningTitle: "Today's plan",
    morningBody: "See today's workout and briefing: weather, kit and food.",
    eveningTitle: "Log today's workout",
    eveningBody: 'Add your RPE and a line about the ride – it takes 20 seconds.',
    boltStale: "Open the app – the workouts on your Bolt haven't been updated for a while.",
    weeklyTitle: 'Your week in review',
    weeklyBody: "Hours, TSS, what went well and what's coming next week.",
    testBody: 'Notifications are working.',
  },

  errors: {
    aiUnavailable: 'The AI coach is unavailable right now – try again later.',
    monthlyLimit: 'The monthly AI limit has been reached – it resets at the start of next month.',
    dailyLimitCheckin: "You've reached today's limit – try again tomorrow or fill in the fields yourself.",
    dailyLimitChat: "You've reached today's chat limit – try again tomorrow.",
    dailyLimitMeal: "You've reached today's limit – try again tomorrow or add the meal yourself.",
    dailyLimitLetter: "You've reached today's limit for test letters – try again tomorrow.",
    mealImages: 'Send 1–2 photos (up to about 1.5 MB each).',
    dietOff: 'Food tracking is turned off for this account.',
    mealUnrecognized: "Couldn't recognise the meal – try another photo.",
    wahooRateSkipped: 'skipped – Wahoo request limit reached',
    badReturn: 'Invalid return address – start signing in again from the app.',
  },

  strava: {
    signature: 'Notes: Bicycle Coach',
    ftpTest: 'FTP test',
    unplannedTitle: 'Unplanned ride',
    planLine: (name, planned, done) => `Plan: ${name}, ${planned} min. Done: ${done} min.`,
    unplannedLine: (min) => `Unplanned, ${min} min.`,
    avgLine: (w, hr) => `Average ${w} W at ${hr} bpm.`,
  },

  note: {
    test: (best20, ftp) => `Test done: your best 20 minutes were ${best20} W, which puts your FTP at about ${ftp} W.`,
    testEven: (blocks) => `Very even pacing (${blocks} W).`,
    testUneven: (blocks) => `5-minute blocks: ${blocks} W – next time try to pace it more evenly from the start.`,
    intervals: (inTarget, total, lo, hi, plan) => `${inTarget} of ${total} intervals in the ${lo}–${hi} W range${plan ? ` (plan: ${plan})` : ''}.`,
    fadeOk: 'Your last interval was no weaker than the first – well paced.',
    fade: (pct) => `Your last interval was ${pct} % weaker than the first – start the first one easier next time.`,
    easyOk: (v, min) => `Nice and easy, just right: IF ${v} for ${min} min.`,
    easyHard: (v, limit) => `Too hard for an easy ride: IF ${v} – zone 2 tops out around ${limit}.`,
    plain: (min, km) => `${min} min ride, ${km} km.`,
    driftOk: (v) => `Heart-rate drift ${v} % – your aerobic base is holding.`,
    driftHigh: (v) => `Heart-rate drift ${v} % – your heart rate crept up in the second half; eat and drink earlier.`,
    record: (span, watts) => `Best ${span} in 90 days: ${watts} W.`,
    minutes: (n) => `${n} min`,
    seconds: (n) => `${n} s`,
  },

  letter: {
    done: (week, done, planned, pct, rides, km) =>
      `In the week of ${week} you rode ${done} of the ${planned} planned${pct != null ? ` (${pct} %)` : ''}: ${rides} ${enWord(rides, 'ride', 'rides')}, ${km} km.`,
    stravaOnly: (n) =>
      `${n} ${enWord(n, 'ride is', 'rides are')} only on Strava – this letter doesn't cover ${n === 1 ? 'it' : 'them'}, but you can see ${n === 1 ? 'it' : 'them'} in the app.`,
    doneNoPlan: (week, done, rides, km) => `In the week of ${week} you rode ${done} over ${rides} ${enWord(rides, 'ride', 'rides')}, ${km} km.`,
    keyAll: 'All key sessions done.',
    keySome: (done, planned) => `Key sessions done: ${done} of ${planned}.`,
    missed: (n) => `${n === 1 ? 'One workout was' : `${n} workouts were`} missed without being marked – if that was your call, mark the day as skipped.`,
    volume: (up, pct) => `Volume ${up ? 'went up' : 'went down'} ${pct} % compared with the previous week.`,
    weight: (kg, change) => `Weight ${kg} kg${change ? ` (${change} kg)` : ''}.`,
    rhr: (bpm, change) => `Resting heart rate averaged ${bpm} bpm${change ? `, ${change} vs the previous week` : ''}.`,
    legs: (v) => `Legs averaged ${v}/5.`,
    noCheckins: "No check-ins this week – I can't see your weight or how you're feeling.",
    flag: (text) => `Note: ${text}.`,
    flags: {
      'tętno spoczynkowe wyraźnie wyżej niż tydzień temu': 'resting heart rate clearly higher than a week ago',
      'nogi ocenione na 1–2 co najmniej dwa razy': 'legs rated 1–2 at least twice',
      'w tygodniu była choroba': 'you were ill this week',
      'dwa lub więcej treningów bez jazdy i bez oznaczenia': 'two or more workouts with no ride and not marked',
      'objętość skoczyła o ponad 30 % względem poprzedniego tygodnia': 'volume jumped by more than 30 % compared with the previous week',
      'mało check-inów – trener nie widzi samopoczucia': "few check-ins – your coach can't see how you're feeling",
    },
    next: (n, duration, key) => `Next week: ${n} ${enWord(n, 'workout', 'workouts')}, ${duration}${key ? `, the most important: ${key}` : ''}.`,
    nextTest: "There's a test in the plan – keep the last few days before it easy so you're fresh.",
  },
}

const DICTS: Record<Lang, Dict> = { pl, en }

/** Słownik dla języka zawodnika. */
export function strings(lang: Lang): Dict {
  return DICTS[lang] ?? pl
}
