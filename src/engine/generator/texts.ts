import type { Bikes, CadencePolicy, Goal as ProgramGoal, NutritionPolicy, Phase, ProgramRules } from '../schema'
import type { z } from 'zod'
import type { ProgramMetaSchema } from '../schema'
type ProgramMeta = z.infer<typeof ProgramMetaSchema>
import type { PhaseId } from '../types'
import type { Weekday } from '../dates'
import type { Discipline, MeasureLevel, PlanInputs } from '../onboarding'
import { TERRAIN, testIdFor } from './library'
import type { DayLayout, Skeleton } from './structure'

/**
 * Teksty programu dla człowieka (docs/32 § 4): reguły R1–R16 jako dane z dniami tygodnia zawodnika, fazy,
 * nazwa planu i cel. Silnik czyta z tych sekcji tylko parametry (`long_catchup_onto`, `deload_note`), reszta jest
 * do czytania w Bibliotece → Zasady.
 */

export const DAY_NAME: Record<Weekday, string> = { mon: 'poniedziałek', tue: 'wtorek', wed: 'środa', thu: 'czwartek', fri: 'piątek', sat: 'sobota', sun: 'niedziela' }
const DAY_ADJ: Record<Weekday, string> = { mon: 'poniedziałkowy', tue: 'wtorkowy', wed: 'środowy', thu: 'czwartkowy', fri: 'piątkowy', sat: 'sobotni', sun: 'niedzielny' }

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

export function goalLabel(inp: PlanInputs): { label: string; short: string } {
  const g = inp.goal
  switch (g.type) {
    case 'event':
      return { label: `${g.name?.trim() || 'Wydarzenie'}: ${g.distance_km} km, ${g.elevation_m} m przewyższenia${g.target_time_min ? `, cel ${Math.floor(g.target_time_min / 60)} h ${String(g.target_time_min % 60).padStart(2, '0')} min` : ''}`, short: g.name?.trim() || `${g.distance_km} km` }
    case 'ftp':
      return { label: `FTP ${g.target_w} W`, short: `FTP ${g.target_w} W` }
    case 'speed':
      return { label: `${fmt(g.kmh)} km/h przez ${fmt(g.hours)} h`, short: `${fmt(g.kmh)} km/h` }
    case 'weight':
      return { label: `Masa ${fmt(g.target_kg)} kg przy zachowaniu formy`, short: `${fmt(g.target_kg)} kg` }
    case 'fitness':
      return { label: `Forma: ${fmt(g.weekly_hours)} h jazdy tygodniowo przez ${g.weeks} tygodni`, short: 'Forma' }
    case 'comeback':
      return { label: `Powrót do jazdy po ${g.weeks_off} tyg. przerwy – do ${fmt(g.weekly_hours)} h tygodniowo`, short: 'Powrót' }
  }
}

export function programGoal(inp: PlanInputs): ProgramGoal {
  const { label, short } = goalLabel(inp)
  if (inp.goal.type === 'speed') return { kind: 'speed', kmh: inp.goal.kmh, label, short }
  return { kind: 'ftp', label, short }
}

export function programMeta(inp: PlanInputs, sk: Skeleton): ProgramMeta {
  const { short } = goalLabel(inp)
  const disc: Record<Discipline, string> = { road: 'szosa', gravel: 'gravel', mtb: 'MTB' }
  const name = `Twój plan: ${short} (${disc[inp.discipline]})`
  if (inp.goal.type === 'event' && sk.horizon === 'to_goal') {
    return { name, short, target: { label: 'Data wydarzenia', short: 'start', until: 'do startu', today: 'Dzień startu!', after: 'Po starcie – czas na nowy cel' } }
  }
  if (sk.horizon === 'to_goal') return { name, short, target: { label: 'Data celu', short: 'cel', until: 'do celu', today: 'Dzień celu – sprawdź, co się zmieniło', after: 'Cel za Tobą – czas na nowy' } }
  return { name, short, target: { label: 'Koniec planu', short: 'koniec', until: 'do końca planu', today: 'Koniec planu – ustawiamy następny cel', after: 'Plan zakończony' } }
}

export function phases(inp: PlanInputs, sk: Skeleton): Phase[] {
  const ids = [...new Set(sk.weeks.map((w) => w.phase))] as PhaseId[]
  const range = (id: PhaseId): [number, number] => {
    const ws = sk.weeks.filter((w) => w.phase === id).map((w) => w.index)
    return [ws[0]!, ws.at(-1)!]
  }
  const g = inp.goal.type
  const texts: Record<PhaseId, { name: string; goal: string }> = {
    PREP: {
      name: sk.weeks[0]!.test ? 'Kalibracja' : 'Wejście w plan',
      goal: sk.weeks[0]!.test ? 'Tydzień wprowadzający: lekkie jazdy i test na końcu. Od jego wyniku liczą się wszystkie strefy – do tego czasu plan używa szacunków.' : 'Tydzień wprowadzający: lekkie jazdy, bez testu – test dojdzie, gdy organizm przywyknie do regularności.',
    },
    I: { name: 'Faza I – Baza', goal: inp.intensity_allowed ? 'Objętość w Z2 z jednym kontrolowanym akcentem (sweet spot). Buduje podłoże, bez którego mocniejsza praca nie ma sensu.' : 'Spokojne jazdy w Z2 bez akcentów i testów – do czasu rozmowy z lekarzem.' },
    II: { name: 'Faza II – Budowa', goal: g === 'weight' || g === 'fitness' || g === 'comeback' ? 'Ta sama struktura, dłuższe jazdy i więcej tempa – forma rośnie bez skoków obciążenia.' : 'Interwały progowe: tu rośnie moc, którą da się utrzymać długo. Długa jazda nadal spokojna.' },
    III: {
      name: 'Faza III – Specyfika',
      goal: g === 'ftp' ? 'Blok VO2max przy obniżonej objętości – podnosi pułap, pod którym leży próg.' : g === 'speed' ? 'Tempo i próg w pozycji aerodynamicznej, długa jazda z blokami tempa – praca pod docelową prędkość.' : 'Praca progowa pod wymagania trasy i długa jazda zbliżona do czasu wydarzenia.',
    },
    IV: { name: 'Faza IV', goal: '' },
    V: { name: 'Faza V', goal: '' },
    TAPER: { name: g === 'event' ? 'Taper i start' : 'Taper i test końcowy', goal: g === 'event' ? 'Świeże nogi, pełne magazyny glikogenu, sprzęt sprawdzony.' : 'Objętość w dół, krótkie pobudzenia i pomiar, który rozlicza plan.' },
  }
  return ids.map((id) => ({ id, name: texts[id].name, goal: texts[id].goal, weeks: range(id) }))
}

export function bikes(inp: PlanInputs): Bikes {
  return { default: TERRAIN[inp.discipline].bike, indoor: inp.indoor ? 'Trenażer' : 'Rower stacjonarny / trenażer' }
}

export const CADENCE: CadencePolicy = { floor_rpm: 75, goal_rpm: 90, tip: 'na jazdach spokojnych 85–95 rpm; siłę na niskiej kadencji zostaw na bloki Z2_FORCE' }

/** Żywienie: deficyt tylko przy celu masy (liczony z masy z check-inu), inaczej bilans zerowy. */
export function nutrition(inp: PlanInputs, phaseIds: PhaseId[], deficitSharesPerWeek: number): NutritionPolicy {
  const weight = inp.goal.type === 'weight'
  const deficit_by_phase = Object.fromEntries(phaseIds.map((p) => [p, weight && p !== 'TAPER']))
  const base: NutritionPolicy = {
    deficit_by_phase,
    protein_g_per_kg: weight ? 1.8 : 1.6,
    heavy_min: 120,
    medium_min: 60,
    buckets: {
      no_deficit: { energy: 'maintenance', label: 'Bilans zerowy – jedz na pełną wydajność' },
      heavy: { energy: 'maintenance', label: 'Dzień ciężki: bez deficytu, paliwo na trening' },
      medium: weight ? { energy: 'deficit_300', label: 'Dzień treningowy: deficyt dobrany do masy', deficit_share: 0.5 } : { energy: 'maintenance', label: 'Dzień treningowy: bilans zerowy' },
      light: weight ? { energy: 'deficit_300', label: 'Dzień lekki: deficyt dobrany do masy', deficit_share: 1 } : { energy: 'maintenance', label: 'Dzień lekki: bilans zerowy' },
    },
    if_above_target_suffix: ' (tylko jeśli waga > celu)',
    carbs_g_per_h: [
      [90, [60, 80]],
      [60, [30, 40]],
    ],
    post_workout: { min_ride_min: 60, text: '20–40 g białka + węglowodany w ciągu 1–2 h' },
  }
  if (weight) base.weight_based = { max_kcal_per_day: 500, max_loss_pct_per_week: 0.7, deficit_shares_per_week: Math.max(0.5, Math.round(deficitSharesPerWeek * 100) / 100) }
  return base
}

const TEST_TEXT: Record<MeasureLevel, { name: string; protocol: string; result: string }> = {
  power: { name: 'Test FTP 20 min (moc)', protocol: '20 min rozgrzewki, 5 min mocno, 10 min luźno, 20 min maksymalnie równo w pojedynkę, 10 min schłodzenia. Zawsze ta sama trasa albo trenażer w trybie wolnym.', result: 'FTP = 0,95 × średnia moc z 20 min; tętno progowe ≈ 0,97 × średnie tętno. Strefy zmieniają się wyłącznie po teście.' },
  hr: { name: 'Test progowy 30 min (tętno)', protocol: '15 min rozgrzewki, 5 min luźno, 30 min maksymalnego równego wysiłku w pojedynkę, 10 min schłodzenia. Zawsze ta sama trasa, pierwsze 5 min nie za mocno.', result: 'LTHR = średnie tętno z minut 10–30. Zapisz też prędkość średnią – to druga miara postępu.' },
  rpe: { name: 'Pętla na czas (odczucie)', protocol: '15 min rozgrzewki, 5 min luźno, 20–30 min maksymalnie równo na tej samej pętli, 10 min schłodzenia. Bez świateł, bez grupy.', result: 'Czas pętli i wysiłek 1–10. Krótszy czas albo niższy wysiłek przy tym samym czasie = postęp. W trakcie mówić się nie da – to „test rozmowy” na odwrót.' },
}

export function rules(inp: PlanInputs, sk: Skeleton, lay: DayLayout): ProgramRules {
  const keys = lay.keys
  const key1 = keys[0]
  const long = lay.long
  const afterLong = long ? lay.easy.find((d) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d) > ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(long)) : undefined
  const easyAfterKey = key1 ? lay.easy.find((d) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d) > ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(key1)) : undefined
  const testWeeks = sk.weeks.filter((w) => w.test).map((w) => w.index)
  const testId = testIdFor(inp.measure)
  const T = TEST_TEXT[inp.measure]
  const text: ProgramRules['text'] = []
  if (key1) {
    text.push({ id: 'R1', title: `Pominięty ${DAY_ADJ[key1]} akcent`, text: easyAfterKey ? `Przenieś na najbliższy dzień ze spokojną jazdą (${DAY_NAME[easyAfterKey]}), nie tuż przed kolejnym akcentem ani długą jazdą. Pominięty i tam → przepada. Nigdy dwóch akcentów dzień po dniu.` : 'Przepada – nie dokładaj go do długiej jazdy ani nie rób dwóch akcentów dzień po dniu.' })
  } else text.push({ id: 'R1', title: 'Pominięty trening', text: 'Pominięta jazda spokojna przepada – nie odrabiaj jej, dołączając do następnej. Liczy się regularność, nie suma.' })
  if (long) text.push({ id: 'R2', title: `Pominięta ${DAY_ADJ[long].replace(/y$/, 'a').replace(/i$/, 'ia')} długa jazda`, text: afterLong ? `Przenieś na ${DAY_NAME[afterLong]} (zastępuje spokojną jazdę). Nie dokładaj jej w kolejnym tygodniu.` : 'Przepada – kolejny tydzień jedziesz według planu, bez odrabiania.' })
  text.push({ id: 'R4', title: 'Gołoledź, śnieg, poniżej −5 °C', text: inp.indoor ? 'Akcent → wersja pod dachem (INDOOR_4x4 na trenażerze). Z2 → 45–60 min na trenażerze, długa jazda → 90 min pod dachem albo zamiana z drugim dniem weekendu.' : 'Akcent → wersja pod dachem na rowerku stacjonarnym (INDOOR_4x4) albo przeniesienie na następny dzień ze spokojną jazdą. Z2 → marsz 60 min albo przerwa. Długa jazda → zamiana z drugim dniem weekendu albo przepada.' })
  text.push({ id: 'R5', title: 'Choroba', text: 'Gorączka lub objawy „poniżej szyi” → zero treningu. Katar bez gorączki → tylko Z1 do 45 min. Po ≥ 3 dniach przerwy: 2 dni krótkiego Z2 przed akcentem. Po ≥ 7 dniach: powtórz poprzedni tydzień.' })
  text.push({ id: 'R6', title: 'Słaby poranny check-in', text: 'Tętno spoczynkowe > średnia 7-dniowa + 7 bpm dwa dni z rzędu albo suma ocen (sen + nogi + motywacja) ≤ 6 → obniż dzień: akcent → Z2 60 min.' })
  if (inp.goal.type === 'weight') text.push({ id: 'R10', title: 'Tempo redukcji masy', text: 'Deficyt tylko w dni lekkie i spokojne, dobrany z masy obecnej i docelowej: najwyżej 500 kcal na dzień i 0,7 % masy na tydzień. W dni akcentów, długiej jazdy i testu – bez deficytu. Spadek wyniku testu przy redukcji → pauza w deficycie na 2 tygodnie.' })
  else text.push({ id: 'R10', title: 'Masa ciała', text: 'Ten plan nie zakłada deficytu – bilans zerowy, paliwo na treningi. Chcesz schudnąć? Zmień cel w „Ty i Twój cel”.' })
  text.push({ id: 'R11', title: 'Nowy wynik testu', text: inp.measure === 'rpe' ? 'Zapisz czas pętli i wysiłek; porównujemy go z poprzednimi testami. Strefy opisane odczuciem nie wymagają przeliczania.' : 'Strefy przeliczone od następnego dnia; aplikacja pokazuje różnicę względem poprzedniego testu.' })
  text.push({ id: 'R12', title: 'Tydzień rozładowania', text: `Co ${sk.block} tygodnie: bez interwałów (akcent → Z2 z pobudzeniem), długa jazda krótsza, objętość ok. −35 %.` })
  text.push({ id: 'R13', title: 'Upał > 28 °C', text: 'Jazdy spokojne i sweet spot: cel tętna niżej o 3–5 bpm (albo wysiłek o 1 niżej), picie 750 ml/h + elektrolity, przy interwałach skróć o jedno powtórzenie.' })
  text.push({ id: 'R14', title: sk.horizon === 'to_goal' ? 'Plan do daty celu' : 'Plan kroczący', text: sk.horizon === 'to_goal' ? `${sk.weeks.length} tygodni po kolei od ${sk.program_start} do daty celu. Zmiana daty celu = nowy plan z „Ty i Twój cel”.` : `${sk.weeks.length} tygodni po kolei od ${sk.program_start}. Przed końcem plan przedłużymy albo ustawimy nowy cel.` })
  text.push({ id: 'R15', title: 'Zamiana dni', text: 'Dozwolona w obrębie tygodnia. Walidacja: brak dwóch akcentów dzień po dniu i akcentu dzień przed długą jazdą, jeśli da się inaczej.' })
  text.push({ id: 'R16', title: 'Skalowanie objętości', text: 'Ustawienie 0,7–1,0 skraca jazdy Z2, długie i pagórki (min. 45 min dla Z2, 90 min dla długiej). Akcenty i testy bez zmian.' })

  const hierarchy: string[] = []
  if (key1) hierarchy.push(`${cap(DAY_ADJ[key1])} akcent`)
  if (long) hierarchy.push(`${cap(DAY_ADJ[long].replace(/y$/, 'a').replace(/i$/, 'ia'))} długa jazda`)
  if (keys[1]) hierarchy.push(`${cap(DAY_ADJ[keys[1]])} drugi akcent`)
  for (const d of lay.easy) hierarchy.push(`${cap(DAY_ADJ[d].replace(/y$/, 'e').replace(/i$/, 'ie'))} Z2`)

  return {
    text,
    hierarchy,
    tests: inp.intensity_allowed ? [{ id: testId, name: T.name, when: testWeeks.length ? `tydz. ${testWeeks.join(', ')}` : 'po konsultacji', protocol: T.protocol, result: T.result }] : [],
    long_catchup_onto: afterLong ? ['easy'] : [],
    deload_note: 'Tydzień lżejszy: bez interwałów, długa krótsza. Nogi mają wyjść świeższe, niż weszły.',
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
