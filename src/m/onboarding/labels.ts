import type { Draft, Step } from '@/engine/onboarding'
import { t } from '@/i18n'
import { fmtDate } from '@/lib/dates'
import { num } from '@/lib/format'

/**
 * Formatery onboardingu (docs/31) – wspólne dla kroków i podsumowania. Etykiety opcji są w słowniku
 * `onboarding` (`src/i18n/pl/onboarding.ts`); tu tylko składanie zdań w chwili wywołania (bieżący język).
 */

/** 6 → „6 h”, 6,5 → „6,5 h” */
export const hours = (h: number) => `${num(h, 1)} h`
/** 90 → „1 h 30 min”, 45 → „45 min” */
export function minutes(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

const list = (a: string[]) => a.join(', ')
/** 2027-06-20 → „20.06.2027” / „20 Jun 2027” */
export const dmy = (iso: string) => fmtDate(iso)

/** Jedna linia podsumowania na krok (pusta = brak danych). */
export function stepSummary(step: Step, d: Draft): string {
  const o = t().onboarding
  const s = o.summary
  switch (step) {
    case 'time':
      return d.time?.hours_per_week ? `${s.perWeek(hours(d.time.hours_per_week))} · ${(d.time.days ?? []).map((x) => o.dayShort[x]).join(' ')}` : ''
    case 'time_detail': {
      const tm = d.time
      if (!tm) return ''
      const parts = [tm.weekday_max_min ? s.weekdayMax(minutes(tm.weekday_max_min)) : null, tm.weekend_max_min ? s.weekendMax(minutes(tm.weekend_max_min)) : null, ...(tm.fixed ?? []).map((f) => `${o.dayShort[f.day]}: ${o.fixed[f.kind]}`)]
      return list(parts.filter((x): x is string => !!x))
    }
    case 'current':
      return d.current?.years ? `${s.perWeekShort(hours(d.current.hours_4w ?? 0))} · ${s.longest(d.current.longest_ride_min ? minutes(d.current.longest_ride_min) : s.none)} · ${o.years[d.current.years]}` : ''
    case 'measure': {
      const m = d.measure
      if (!m?.level) return ''
      return list([o.measure[m.level], m.ftp_w ? `FTP ${m.ftp_w} W` : '', m.lthr_bpm ? `LTHR ${m.lthr_bpm} bpm` : '', m.hr_max_bpm ? s.hrMax(m.hr_max_bpm) : ''].filter(Boolean))
    }
    case 'gear': {
      const g = d.gear
      if (!g?.disciplines?.length) return ''
      return list([g.disciplines.map((x) => o.discipline[x]).join(' + '), g.trainer ? s.trainer(o.trainer[g.trainer].toLowerCase()) : '', ...(g.devices ?? []).map((x) => o.device[x])].filter(Boolean))
    }
    case 'consent':
      return d.consent?.health_data ? s.consentGiven(d.consent.at ? dmy(d.consent.at.slice(0, 10)) : '').trim() : ''
    case 'body': {
      const b = d.body
      const parts = [b?.height_cm ? `${b.height_cm} cm` : '', b?.weight_kg ? `${num(b.weight_kg, 1)} kg` : '', b?.birth_date ? s.born(dmy(b.birth_date)) : '', b?.sex ? s.sex[b.sex] : '']
      return list(parts.filter(Boolean)) || s.skipped
    }
    case 'health':
      return ''
    case 'goal':
      return d.goal?.type ? o.goal[d.goal.type].title : ''
    case 'goal_detail':
      return goalSummary(d.goal)
  }
}

const dateLabel = (iso: string | null | undefined) => (iso ? t().onboarding.summary.until(dmy(iso)) : '')

export function goalSummary(g: Draft['goal']): string {
  const o = t().onboarding
  const s = o.summary
  switch (g?.type) {
    case 'event':
      return g.distance_km ? `${g.name ? `${g.name} · ` : ''}${s.eventClimb(g.distance_km, num(g.elevation_m ?? 0, 0))}${g.target_time_min ? s.within(minutes(g.target_time_min)) : ''}${dateLabel(g.date)}` : ''
    case 'ftp':
      return g.target_w ? `FTP ${g.target_w} W${dateLabel(g.date)}` : ''
    case 'speed':
      return g.kmh ? `${s.speedFor(num(g.kmh, 0), hours(g.hours ?? 0))}${dateLabel(g.date)}` : ''
    case 'weight':
      return g.target_kg ? `${num(g.target_kg, 1)} kg${dateLabel(g.date)}` : ''
    case 'fitness':
      return g.weekly_hours ? s.fitnessFor(hours(g.weekly_hours), g.weeks != null ? String(g.weeks) : '?') : ''
    case 'comeback':
      return g.weeks_off ? s.comeback(g.weeks_off, o.reason[g.reason ?? 'other'], hours(g.weekly_hours ?? 0)) : ''
    default:
      return ''
  }
}
