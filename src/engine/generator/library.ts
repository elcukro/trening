import type { BikeWorkout, HrZone, PowerZone, Step, StepBlock } from '../schema'
import type { Discipline, MeasureLevel } from '../onboarding'

/**
 * Biblioteka treningów generatora (docs/32 § 3). Te same identyfikatory i kształt kroków co w programach
 * z `data/` (silnik rozpoznaje akcenty po przedrostkach `SS_`/`THR_`/`VO2_`/`TEST`/`FTP`, skaluje `Z2`/`LONG`/`HILLS`,
 * a reguły sięgają po `Z2`, `Z1_RECOVERY`, `INDOOR_4x4`), ale opisy zależą od dyscypliny i poziomu pomiaru:
 * moc mówi w % FTP, tętno w % LTHR, odczucie w RPE i „teście rozmowy”. Kadencja standardowa (85–95) – indywidualne
 * ustalenia jednego zawodnika nie trafiają tu nigdy (docs/18).
 */

export const HR_ZONES: HrZone[] = [
  { id: 'Z1', name: 'Regeneracja', low: 0.0, high: 0.81, rpe: [1, 2] },
  { id: 'Z2', name: 'Wytrzymałość (baza)', low: 0.81, high: 0.89, rpe: [3, 4] },
  { id: 'Z3', name: 'Tempo', low: 0.9, high: 0.93, rpe: [5, 6] },
  { id: 'SS', name: 'Sweet spot', low: 0.92, high: 0.96, rpe: [6, 7] },
  { id: 'Z4', name: 'Podprogowa', low: 0.94, high: 0.99, rpe: [7, 8] },
  { id: 'THR', name: 'Progowa (interwały)', low: 0.95, high: 1.0, rpe: [7, 8] },
  { id: 'Z5a', name: 'Nadprogowa', low: 1.0, high: 1.02, rpe: [8, 9] },
  { id: 'Z5b', name: 'VO2max', low: 1.03, high: 1.06, rpe: [9, 9] },
  { id: 'Z5c', name: 'Beztlenowa', low: 1.06, high: 1.15, rpe: [10, 10] },
]

export const POWER_ZONES: PowerZone[] = [
  { id: 'Z1', low: 0.0, high: 0.55 },
  { id: 'Z2', low: 0.56, high: 0.75 },
  { id: 'Z3', low: 0.76, high: 0.9 },
  { id: 'SS', low: 0.88, high: 0.94 },
  { id: 'Z4', low: 0.91, high: 1.05 },
  { id: 'THR', low: 0.95, high: 1.0 },
  { id: 'Z5b', low: 1.06, high: 1.2 },
  { id: 'Z5c', low: 1.21, high: 1.5 },
]

const ZONE = Object.fromEntries(HR_ZONES.map((z) => [z.id, z])) as Record<string, HrZone>

const CAD_EASY: [number, number] = [85, 95]
const CAD_CD: [number, number] = [90, 100]

type Cad = [number, number] | null

export function step(name: string, minutes: number, zone: string, intensity: Step['intensity_type'] = 'active', cadence: Cad = null, note?: string, rpe?: [number, number]): Step {
  const z = ZONE[zone]!
  const s: Step = {
    name,
    duration_s: Math.round(minutes * 60),
    zone,
    target: { type: 'threshold_hr', low: z.low, high: z.high },
    rpe: rpe ?? z.rpe,
    intensity_type: intensity,
  }
  if (cadence) s.cadence_rpm = cadence
  if (note) s.note = note
  return s
}

export const repeat = (times: number, steps: StepBlock[]): StepBlock => ({ repeat: times, steps })

export function totalSeconds(blocks: StepBlock[]): number {
  return blocks.reduce((t, b) => t + ('repeat' in b ? b.repeat * totalSeconds(b.steps) : b.duration_s), 0)
}

const WU = (m = 15) => step('Rozgrzewka', m, 'Z2', 'wu', CAD_EASY, 'Stopniowo od Z1 do górnej Z2; ostatnie 3 min z 2×20 s przyspieszenia.')
const CD = (m = 10) => step('Schłodzenie', m, 'Z1', 'cd', CAD_CD)

/* ------------------------------------------------------------------ język poziomu pomiaru */

/** Jak opisujemy intensywność strefy w danym poziomie pomiaru (docs/30 § 3). */
export function intensityText(level: MeasureLevel, zone: 'Z1' | 'Z2' | 'Z3' | 'SS' | 'THR' | 'Z5b'): string {
  const t = {
    power: { Z1: 'poniżej 55 % FTP', Z2: '56–75 % FTP', Z3: '76–90 % FTP', SS: '88–94 % FTP', THR: '95–100 % FTP', Z5b: '106–120 % FTP' },
    hr: { Z1: 'poniżej 81 % LTHR', Z2: '81–89 % LTHR', Z3: '90–93 % LTHR', SS: '92–96 % LTHR', THR: '95–100 % LTHR pod koniec interwału', Z5b: '103–106 % LTHR w końcówce' },
    rpe: {
      Z1: 'wysiłek 1–2/10, swobodna rozmowa, oddech jak na spacerze',
      Z2: 'wysiłek 3–4/10, mówisz pełnymi zdaniami bez łapania oddechu',
      Z3: 'wysiłek 5–6/10, zdania krótsze, ale płynne',
      SS: 'wysiłek 6–7/10, tylko pojedyncze słowa między oddechami',
      THR: 'wysiłek 7–8/10, mówienie już nie wchodzi w grę, oddech głęboki i rytmiczny',
      Z5b: 'wysiłek 9/10, oddech na granicy – ostatnia minuta każdego powtórzenia naprawdę trudna',
    },
  } as const
  return t[level][zone]
}

/* ------------------------------------------------------------------ biblioteka */

export interface LibraryOptions {
  discipline: Discipline
  level: MeasureLevel
  /** ma trenażer – opisy wersji pod dachem mówią o ERG, nie o rowerku na siłowni */
  indoor: boolean
}

type Endurance = { id: string; name: string; minutes: number; zone?: string; desc: string; category?: string; cadence?: Cad; key?: boolean; insert?: StepBlock }

function endurance(o: Endurance): BikeWorkout {
  const zone = o.zone ?? 'Z2'
  const w: BikeWorkout = {
    id: o.id,
    name: o.name,
    category: o.category ?? 'endurance',
    key: o.key ?? false,
    steps: [step(o.name, o.minutes, zone, 'active', o.cadence ?? CAD_EASY, o.desc)],
    duration_min: o.minutes,
    description: o.desc,
    parametric_duration: true,
  }
  if (o.insert) w.insert = o.insert
  return w
}

function intervals(id: string, name: string, category: string, reps: number, workMin: number, recMin: number, zone: string, cadence: [number, number], description: string, lagNote: string, wu = 15, cd = 10): BikeWorkout {
  const intensity: Step['intensity_type'] = zone === 'THR' || zone === 'Z4' ? 'lt' : zone === 'Z5b' ? 'map' : 'active'
  const steps: StepBlock[] = [WU(wu), repeat(reps, [step(`Interwał ${workMin} min`, workMin, zone, intensity, cadence, lagNote), step('Przerwa', recMin, 'Z1', 'recover', CAD_EASY)]), CD(cd)]
  return { id, name, category, key: true, steps, duration_min: Math.round(totalSeconds(steps) / 60), description }
}

/** Drabinki progresji akcentów – generator wybiera szczebel wg numeru tygodnia w fazie i limitu czasu dnia. */
export const LADDERS = {
  sweet_spot: [
    ['SS_2x10', 2, 10, 5],
    ['SS_2x12', 2, 12, 5],
    ['SS_3x10', 3, 10, 5],
    ['SS_2x15', 2, 15, 5],
    ['SS_3x12', 3, 12, 5],
    ['SS_3x15', 3, 15, 5],
    ['SS_2x20', 2, 20, 5],
    ['SS_3x20', 3, 20, 5],
  ],
  threshold: [
    ['THR_4x6', 4, 6, 4],
    ['THR_4x8', 4, 8, 4],
    ['THR_3x12', 3, 12, 5],
    ['THR_3x15', 3, 15, 5],
    ['THR_2x20', 2, 20, 6],
  ],
  vo2max: [
    ['VO2_4x3', 4, 3, 3],
    ['VO2_5x3', 5, 3, 3],
    ['VO2_6x3', 6, 3, 3],
  ],
  tempo: [
    ['TEMPO_2x15', 2, 15, 5],
    ['TEMPO_2x20', 2, 20, 5],
    ['TEMPO_3x15', 3, 15, 5],
    ['TEMPO_3x20', 3, 20, 5],
  ],
} as const satisfies Record<string, readonly (readonly [string, number, number, number])[]>

export type LadderId = keyof typeof LADDERS

const TERRAIN: Record<Discipline, { long: string; hills: string; climbs: string; bike: string; indoor: string }> = {
  road: {
    long: 'Główny trening objętościowy na szosie. Z2 na płaskim, podjazdy spokojnie (najwyżej górna Z3). Jedz od 45. minuty: 60–80 g węglowodanów na godzinę, pij 500–750 ml/h.',
    hills: 'Pofałdowana trasa. Podjazdy w Z3 na miękkim przełożeniu (kadencja 75–85), zjazdy i płaskie w Z2.',
    climbs: 'Interwały pod górę (albo pod wiatr): równe tempo, siedząc, na miękkim przełożeniu.',
    bike: 'Rower szosowy',
    indoor: 'Trenażer',
  },
  gravel: {
    long: 'Główny trening objętościowy – szuter, leśne drogi, mieszane nawierzchnie. Z2 z natury faluje w terenie: pilnuj, żeby średnio zostać w Z2, podjazdy najwyżej górna Z3. Jedz od 45. minuty: 60–80 g węglowodanów/h, pij 500–750 ml/h.',
    hills: 'Pofałdowany szuter. Podjazdy w Z3 na miękkim przełożeniu, zjazdy i płaskie w Z2 – bez „mielenia” na twardym biegu w piachu.',
    climbs: 'Interwały na długim, równym podjeździe (asfalt albo twardy szuter) – równe tempo, bez szarpania w zakrętach.',
    bike: 'Gravel',
    indoor: 'Trenażer',
  },
  mtb: {
    long: 'Długa jazda w terenie liczona czasem, nie dystansem. Z2 na dojazdach i łatwych odcinkach, techniczne fragmenty spokojnie – to nie jest dzień na rekordy zjazdów. Jedz od 45. minuty: 60–80 g węglowodanów/h, pij 500–750 ml/h.',
    hills: 'Szlak z podjazdami. Podjazdy w Z3, zjazdy i dojazdy w Z2; na zjazdach ćwicz pozycję i patrzenie daleko przed koło.',
    climbs: 'Interwały na długim, równym podjeździe (najlepiej szutrowym albo asfaltowym – trudny techniczny szlak psuje równość wysiłku).',
    bike: 'Rower MTB',
    indoor: 'Trenażer',
  },
}

/**
 * Pełna biblioteka dla danych parametrów. Zawsze ma: REST, Z1_RECOVERY, Z2, LONG, HILLS, Z2_FORCE, DELOAD, OPENERS,
 * INDOOR_4x4, TRIP, test właściwy dla poziomu pomiaru i wszystkie drabinki akcentów (generator wybiera z nich,
 * a Biblioteka w aplikacji pokaże tylko to, co jest w planie, i resztę jako zapas).
 */
export function buildLibrary(o: LibraryOptions): Record<string, BikeWorkout> {
  const L = o.level
  const T = TERRAIN[o.discipline]
  const lib: Record<string, BikeWorkout> = {}
  const add = (w: BikeWorkout) => {
    lib[w.id] = w
  }

  const z2 = intensityText(L, 'Z2')
  const z1 = intensityText(L, 'Z1')
  const lag = L === 'power' ? 'Pierwsze 2–3 min interwału prowadź po mocy, nie po tętnie – tętno dogania wysiłek z opóźnieniem.' : L === 'hr' ? 'Pierwsze 2–3 min interwału prowadź po odczuciu – tętno dogania wysiłek z opóźnieniem. Nie goń tętna na starcie.' : 'Pierwszą minutę zacznij spokojniej, niż masz ochotę – wysiłek ma być równy od startu do końca.'

  add(endurance({ id: 'REST', name: 'Odpoczynek', minutes: 0, zone: 'Z1', desc: 'Pełny dzień wolny. Spacer, sen, rozciąganie zginaczy bioder 5 min.', category: 'rest' }))
  add(endurance({ id: 'Z1_RECOVERY', name: 'Jazda regeneracyjna', minutes: 45, zone: 'Z1', desc: `Bardzo luźno, miękki bieg, bez podjazdów (${z1}). Opcjonalna – jeśli nogi są ciężkie, lepiej odpocząć.`, category: 'recovery', cadence: [90, 100] }))
  add(endurance({ id: 'Z2', name: 'Baza tlenowa Z2', minutes: 60, desc: `Równe tempo w Z2 (${z2}). Kadencja 85–95. Nudne ma być – to jest cel.` }))
  add(endurance({ id: 'LONG', name: 'Długa jazda', minutes: 150, desc: `${T.long} Intensywność: ${z2}.`, category: 'long' }))
  add(endurance({ id: 'LONG_TEMPO', name: 'Długa jazda z blokami tempa', minutes: 180, desc: `${T.long} W środku jazdy 3×15 min w Z3 (${intensityText(L, 'Z3')}) w pozycji aerodynamicznej / 5 min Z2.`, category: 'long', insert: repeat(3, [step('Tempo', 15, 'Z3', 'tempo', [88, 95]), step('Z2', 5, 'Z2', 'recover', CAD_EASY)]) }))
  add(endurance({ id: 'HILLS', name: 'Pagórki', minutes: 105, desc: `${T.hills} Płaskie: ${z2}.`, category: 'hills' }))
  add(endurance({ id: 'Z2_FORCE', name: 'Z2 + siła na niskiej kadencji', minutes: 75, desc: `Z2 (${z2}) z blokami siły: 4×5 min na twardym biegu przy 55–65 rpm, siedząc, tułów spokojny / 5 min swobodnie. Kolana bez bólu – inaczej wyższa kadencja.`, insert: repeat(4, [step('Siła 55–65 rpm', 5, 'Z3', 'active', [55, 65], 'Twardy bieg, siedząc; liczy się nacisk na pedał, nie tętno.'), step('Z2 swobodnie', 5, 'Z2', 'recover', CAD_EASY)]) }))
  add(endurance({ id: 'DELOAD', name: 'Tydzień lżejszy: Z2 z pobudzeniem', minutes: 60, desc: `Z2 (${z2}), w środku 3×1 min mocniej (Z3–Z4) z 3 min luzu. Nogi mają wyjść świeższe, nie zmęczone.`, insert: repeat(3, [step('Pobudzenie', 1, 'Z4', 'lt', [90, 100]), step('Luz', 3, 'Z2', 'recover', CAD_EASY)]) }))
  if (o.discipline === 'mtb') add(endurance({ id: 'MTB_SKILLS', name: 'Technika na szlaku', minutes: 60, desc: `Łatwy, znany szlak w Z2 (${z2}) z kilkoma powtórzeniami krótkich odcinków technicznych (zakręty, korzenie, zjazd) – luźno, bez ścigania. Celem jest płynność, nie tętno.`, category: 'skills' }))

  const ssDesc = `Sweet spot: mocno, ale kontrolowanie (${intensityText(L, 'SS')}). ${T.climbs.replace('Interwały', 'Najlepiej')} Kadencja 80–90.`
  const thrDesc = `${T.climbs} Intensywność progowa: ${intensityText(L, 'THR')}. Kadencja 75–85.`
  const vo2Desc = `VO2max: 3 min mocno, ale równo (${intensityText(L, 'Z5b')}) – nie sprint na starcie. Przerwa 3 min bardzo luźno.`
  const tempoDesc = `Tempo: płynnie i równo (${intensityText(L, 'Z3')}), pozycja aerodynamiczna, kadencja 88–95. Przerwa 5 min w Z2.`
  const labels: Record<LadderId, [string, string, string, [number, number]]> = {
    sweet_spot: ['Sweet spot', 'sweet_spot', 'SS', [80, 90]],
    threshold: ['Próg', 'threshold', 'THR', [75, 85]],
    vo2max: ['VO2max', 'vo2max', 'Z5b', [85, 95]],
    tempo: ['Tempo', 'tempo', 'Z3', [88, 95]],
  }
  const descs: Record<LadderId, string> = { sweet_spot: ssDesc, threshold: thrDesc, vo2max: vo2Desc, tempo: tempoDesc }
  for (const ladder of Object.keys(LADDERS) as LadderId[]) {
    const [label, category, zone, cad] = labels[ladder]
    for (const [id, reps, m, rec] of LADDERS[ladder]) add(intervals(id, `${label} ${reps}×${m} min`, category, reps, m, rec, zone, cad, descs[ladder], lag, ladder === 'vo2max' ? 20 : 15))
  }
  add(intervals('INDOOR_4x4', `Wersja pod dachem: 4×4 min (${o.indoor ? 'trenażer' : 'rowerek stacjonarny'})`, 'indoor', 4, 4, 3, 'Z5b', [85, 95], `Gdy nie da się wyjechać (gołoledź, mróz, burza). Zastępuje akcent tygodnia. ${intensityText(L, 'Z5b')}.`, lag, 10, 5))

  // testy kalibracyjne – jeden właściwy dla poziomu pomiaru (docs/30 § 3), reszta jako zapas w bibliotece
  const ftpSteps: StepBlock[] = [
    step('Rozgrzewka', 20, 'Z2', 'wu', CAD_EASY, 'Z2; w środku 3×1 min z kadencją 100 rpm.'),
    step('5 min mocno', 5, 'Z4', 'lt', CAD_EASY, 'Otwarcie nóg, nie próba – trzymaj podany zakres. Za mocno tutaj zaniża wynik testu.'),
    step('Luz', 10, 'Z1', 'recover', CAD_EASY),
    step('TEST 20 min – maksymalnie równo', 20, 'Z5a', 'ftp', CAD_EASY, 'Płaska, prosta trasa bez świateł albo trenażer w trybie wolnym (nie ERG), zawsze tak samo. Pierwsze 5 min świadomie wolniej, niż chcesz. FTP = 95 % średniej mocy; tętno progowe ≈ 97 % średniego tętna.', [9, 10]),
    CD(10),
  ]
  add({ id: 'FTP_TEST', name: 'Test FTP 20 min (moc)', category: 'test', key: true, steps: ftpSteps, duration_min: Math.round(totalSeconds(ftpSteps) / 60), description: 'Test progowy z miernikiem mocy: 20 min maksymalnie równo. FTP = 0,95 × średnia moc, tętno progowe ≈ 0,97 × średnie tętno z 20 min. Powtarzany co blok – FTP i strefy zmieniają się tylko po teście.' })
  const lthrSteps: StepBlock[] = [WU(15), step('Luźno przed testem', 5, 'Z1', 'recover'), step('TEST 30 min – maksymalny równy wysiłek', 30, 'THR', 'ftp', CAD_EASY, 'Samotnie, płaska trasa albo równy lekki podjazd, zawsze ta sama. Pierwsze 5 min nie za mocno. LTHR = średnie tętno z minut 10–30.', [9, 9]), CD(10)]
  add({ id: 'TEST_LTHR', name: 'Test progowy 30 min (tętno)', category: 'test', key: true, steps: lthrSteps, duration_min: Math.round(totalSeconds(lthrSteps) / 60), description: 'Test Friela: 30 min maksymalnego równego wysiłku w pojedynkę. LTHR = średnie tętno z ostatnich 20 min. Po teście aplikacja przelicza strefy tętna. Zapisz też prędkość średnią i trasę – to miara postępu między testami.' })
  const loopSteps: StepBlock[] = [WU(15), step('Luźno przed testem', 5, 'Z1', 'recover'), step('TEST – stała pętla na czas (20–30 min)', 25, 'THR', 'ftp', CAD_EASY, 'Ta sama pętla albo ten sam odcinek za każdym razem, bez świateł i ruchu. Równy, maksymalny wysiłek, który da się utrzymać do końca (9/10). Zapisz czas, średnią prędkość i jak się czułeś.', [9, 9]), CD(10)]
  add({ id: 'TEST_LOOP', name: 'Pętla na czas (odczucie)', category: 'test', key: true, steps: loopSteps, duration_min: Math.round(totalSeconds(loopSteps) / 60), description: 'Kalibracja bez urządzeń: stała pętla 20–30 min przejechana równo i maksymalnie, z zapisanym czasem i oceną wysiłku 1–10. Powtarzana co blok w tych samych warunkach – krótszy czas albo niższy wysiłek przy tym samym czasie to postęp. Podczas jazdy pilnuj „testu rozmowy”: na pętli nie powinno dać się mówić.' })

  add({
    id: 'OPENERS',
    name: 'Pobudzenie przed startem',
    category: 'taper',
    key: false,
    steps: [WU(15), repeat(3, [step('Tempo 3 min', 3, 'Z4', 'lt', [85, 95]), step('Luźno', 3, 'Z1', 'recover')]), repeat(5, [step('Przyspieszenie 30 s', 0.5, 'Z5b', 'ac', [95, 110], undefined, [8, 9]), step('Luźno 90 s', 1.5, 'Z1', 'recover')]), CD(10)],
    duration_min: 60,
    description: 'Taper: krótko i świeżo. Objętość tygodnia w dół, intensywność tylko w krótkich pobudzeniach – nogi mają pamiętać tempo, nie zmęczenie.',
  })
  add(endurance({ id: 'GROUP_RIDE', name: 'Jazda z grupą', minutes: 120, desc: `Twój stały punkt tygodnia. W grupie tempo narzuca grupa – liczy się jako jazda spokojna, jeśli większość czasu jest w Z2 (${z2}); gdy grupa jedzie mocno, traktuj ją jak akcent i następny dzień zrób lżej.`, category: 'endurance' }))
  add(endurance({ id: 'COMMUTE', name: 'Dojazd rowerem', minutes: 45, desc: `Dojazd do pracy liczy się do tygodnia jako lekka jazda (${z1} do ${z2}). Nie ścigaj się ze światłami.`, category: 'recovery', cadence: [85, 100] }))
  add(endurance({ id: 'RACE', name: 'Wyścig / zawody', minutes: 120, desc: 'Twój stały start. Zastępuje akcent tygodnia – dzień wcześniej krótko i lekko, dzień po regeneracyjnie.', category: 'race', key: true }))
  add(endurance({ id: 'TRIP', name: 'Dzień celu', minutes: 0, desc: 'Dzień, na który pracował cały plan. Po nim ustawiamy następny cel.', category: 'trip' }))
  return lib
}

/** Identyfikator testu kalibracyjnego dla poziomu pomiaru. */
export function testIdFor(level: MeasureLevel): 'FTP_TEST' | 'TEST_LTHR' | 'TEST_LOOP' {
  return level === 'power' ? 'FTP_TEST' : level === 'hr' ? 'TEST_LTHR' : 'TEST_LOOP'
}

export { TERRAIN }
