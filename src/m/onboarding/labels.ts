import type { Weekday } from '@/engine/dates'
import type { Draft, Goal, HealthQuestion, Step } from '@/engine/onboarding'
import { num } from '@/lib/format'

/** Etykiety onboardingu (docs/31) – wspólne dla kroków i podsumowania. */

export const DAY_SHORT: Record<Weekday, string> = { mon: 'pn', tue: 'wt', wed: 'śr', thu: 'cz', fri: 'pt', sat: 'sb', sun: 'nd' }
export const DAY_LONG: Record<Weekday, string> = { mon: 'Poniedziałek', tue: 'Wtorek', wed: 'Środa', thu: 'Czwartek', fri: 'Piątek', sat: 'Sobota', sun: 'Niedziela' }
export const FIXED_LABEL = { group_ride: 'jazda z grupą', commute: 'dojazd do pracy', race: 'wyścig', other: 'inne' } as const
export const YEARS_LABEL = { lt1: 'mniej niż rok', '1to3': '1–3 lata', '3to5': '3–5 lat', '5to10': '5–10 lat', '10plus': 'ponad 10 lat' } as const
export const DISCIPLINE_LABEL = { road: 'Szosa', gravel: 'Gravel', mtb: 'MTB' } as const
export const BIKE_LABEL = { road: 'Szosowy', gravel: 'Gravel', mtb: 'MTB' } as const
export const TRAINER_LABEL = { none: 'Nie mam', smart: 'Smart', classic: 'Klasyczny', rollers: 'Rolki' } as const
export const DEVICE_LABEL = { wahoo: 'Wahoo', garmin: 'Garmin', hammerhead: 'Hammerhead', coros: 'COROS', polar: 'Polar', suunto: 'Suunto', apple: 'Apple Watch', phone: 'Telefon' } as const
export const MEASURE_LABEL = { power: 'Miernik mocy', hr: 'Tętno', rpe: 'Na odczucie' } as const
export const REASON_LABEL = { illness: 'choroba', injury: 'kontuzja', life: 'praca, rodzina', other: 'inny powód' } as const

export const GOAL_LABEL: Record<Goal['type'], { title: string; sub: string }> = {
  event: { title: 'Wydarzenie', sub: 'gran fondo, maraton, wyjazd w góry' },
  ftp: { title: 'Więcej mocy', sub: 'wyższe FTP w watach' },
  speed: { title: 'Szybsze tempo', sub: 'np. 30 km/h przez 2 godziny' },
  weight: { title: 'Masa ciała', sub: 'schudnąć przy rozsądnym tempie' },
  fitness: { title: 'Forma ogólna', sub: 'jeździć regularnie i czuć się lepiej' },
  comeback: { title: 'Powrót po przerwie', sub: 'po chorobie, kontuzji albo dłuższej przerwie' },
}

export const HEALTH_TEXT: Record<HealthQuestion, string> = {
  heart: 'Czy lekarz stwierdził u Ciebie chorobę serca albo nadciśnienie?',
  chest_pain: 'Czy czujesz ból w klatce piersiowej – w spoczynku albo przy wysiłku?',
  dizziness: 'Czy w ostatnim roku zdarzyła Ci się utrata przytomności albo równowagi przez zawroty głowy?',
  supervised: 'Czy lekarz zalecił Ci wysiłek tylko pod nadzorem medycznym?',
  chronic: 'Czy masz inną chorobę przewlekłą, np. cukrzycę albo astmę?',
  meds: 'Czy bierzesz stale leki przepisane przez lekarza?',
  injury: 'Czy masz świeżą kontuzję albo ból stawów, który nasila się przy wysiłku?',
}

/** 6 → „6 h”, 6,5 → „6,5 h” */
export const hours = (h: number) => `${num(h, h % 1 ? 1 : 0)} h`
/** 90 → „1 h 30 min”, 45 → „45 min” */
export function minutes(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/** Tytuły kroków – w nagłówku i w podsumowaniu. */
export const STEP_TITLE: Record<Step, string> = {
  time: 'Czas',
  time_detail: 'Twój tydzień',
  current: 'Obecna forma',
  measure: 'Pomiar',
  gear: 'Sprzęt',
  consent: 'Zgoda',
  body: 'Ciało',
  health: 'Zdrowie',
  goal: 'Cel',
  goal_detail: 'Szczegóły celu',
}

const list = (a: string[]) => a.join(', ')
/** 2027-06-20 → 20.06.2027 */
export const dmy = (iso: string) => iso.split('-').toReversed().join('.')

/** Jedna linia podsumowania na krok (pusta = brak danych). */
export function stepSummary(step: Step, d: Draft): string {
  switch (step) {
    case 'time':
      return d.time?.hours_per_week ? `${hours(d.time.hours_per_week)} tygodniowo · ${(d.time.days ?? []).map((x) => DAY_SHORT[x]).join(' ')}` : ''
    case 'time_detail': {
      const t = d.time
      if (!t) return ''
      const parts = [t.weekday_max_min ? `dzień roboczy do ${minutes(t.weekday_max_min)}` : null, t.weekend_max_min ? `weekend do ${minutes(t.weekend_max_min)}` : null, ...(t.fixed ?? []).map((f) => `${DAY_SHORT[f.day]}: ${FIXED_LABEL[f.kind]}`)]
      return list(parts.filter((x): x is string => !!x))
    }
    case 'current':
      return d.current?.years ? `${hours(d.current.hours_4w ?? 0)}/tydz. · najdłuższa ${d.current.longest_ride_min ? minutes(d.current.longest_ride_min) : 'brak'} · ${YEARS_LABEL[d.current.years]}` : ''
    case 'measure': {
      const m = d.measure
      if (!m?.level) return ''
      return list([MEASURE_LABEL[m.level], m.ftp_w ? `FTP ${m.ftp_w} W` : '', m.lthr_bpm ? `LTHR ${m.lthr_bpm} bpm` : '', m.hr_max_bpm ? `max ${m.hr_max_bpm} bpm` : ''].filter(Boolean))
    }
    case 'gear': {
      const g = d.gear
      if (!g?.disciplines?.length) return ''
      return list([g.disciplines.map((x) => DISCIPLINE_LABEL[x]).join(' + '), g.trainer ? `trenażer: ${TRAINER_LABEL[g.trainer].toLowerCase()}` : '', ...(g.devices ?? []).map((x) => DEVICE_LABEL[x])].filter(Boolean))
    }
    case 'consent':
      return d.consent?.health_data ? `udzielona ${dmy(d.consent.at?.slice(0, 10) ?? '')}` : ''
    case 'body': {
      const b = d.body
      const parts = [b?.height_cm ? `${b.height_cm} cm` : '', b?.weight_kg ? `${num(b.weight_kg, b.weight_kg % 1 ? 1 : 0)} kg` : '', b?.birth_date ? `ur. ${dmy(b.birth_date)}` : '', b?.sex ? (b.sex === 'female' ? 'kobieta' : 'mężczyzna') : '']
      return list(parts.filter(Boolean)) || 'pominięte'
    }
    case 'health':
      return ''
    case 'goal':
      return d.goal?.type ? GOAL_LABEL[d.goal.type].title : ''
    case 'goal_detail':
      return goalSummary(d.goal)
  }
}

const dateLabel = (iso: string | null | undefined) => (iso ? ` do ${dmy(iso)}` : '')

export function goalSummary(g: Draft['goal']): string {
  switch (g?.type) {
    case 'event':
      return g.distance_km ? `${g.name ? `${g.name} · ` : ''}${g.distance_km} km, ${num(g.elevation_m ?? 0, 0)} m w górę${g.target_time_min ? ` w ${minutes(g.target_time_min)}` : ''}${dateLabel(g.date)}` : ''
    case 'ftp':
      return g.target_w ? `FTP ${g.target_w} W${dateLabel(g.date)}` : ''
    case 'speed':
      return g.kmh ? `${num(g.kmh, 0)} km/h przez ${hours(g.hours ?? 0)}${dateLabel(g.date)}` : ''
    case 'weight':
      return g.target_kg ? `${num(g.target_kg, g.target_kg % 1 ? 1 : 0)} kg${dateLabel(g.date)}` : ''
    case 'fitness':
      return g.weekly_hours ? `${hours(g.weekly_hours)} tygodniowo przez ${g.weeks ?? '?'} tyg.` : ''
    case 'comeback':
      return g.weeks_off ? `po ${g.weeks_off} tyg. przerwy (${REASON_LABEL[g.reason ?? 'other']}) → ${hours(g.weekly_hours ?? 0)}/tydz.` : ''
    default:
      return ''
  }
}
