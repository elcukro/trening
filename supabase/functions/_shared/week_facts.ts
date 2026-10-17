// Fakty tygodnia do niedzielnego listu trenera (docs/19 § List tygodnia). Czysty TS – kod liczy, model opowiada;
// każda liczba w liście musi być w tych faktach (numbersOk z ride_facts.ts). Testy: src/engine/__tests__/week_facts.test.ts.
import { fulfilsPlan, rideLoadLite, type DaySnapshot, type RideLite } from './email_views.ts'

export interface WeekRideIn extends RideLite {
  note?: string | null
}

export interface WeekInput {
  monday: string
  /** migawki planu dnia (email_days) dla tygodnia i następnego – brak = dzień bez migawki */
  snapshots: Record<string, DaySnapshot | null>
  rides: WeekRideIn[]
  /** jazdy poprzedniego tygodnia (do porównania objętości i TSS) */
  prevRides: RideLite[]
  logs: { date: string; status: string; rpe: number | null }[]
  checkins: { date: string; weight_kg: number | null; resting_hr: number | null; sleep: number | null; legs: number | null; motivation: number | null; sick: boolean | null }[]
  /** check-iny tygodnia poprzedniego (średnie odniesienia dla tętna spoczynkowego i masy) */
  prevCheckins: WeekInput['checkins']
}

export interface WeekDayFacts {
  date: string
  weekday: string
  planned: { name: string; minutes: number; hm: string; day_type: string } | null
  /** done = plan wypełniony (≥ 80 % czasu), modified = jazda była, ale krótsza/inna, skipped = oznaczone, missed = plan bez jazdy, extra = jazda w dzień wolny, free = wolne */
  outcome: 'done' | 'modified' | 'skipped' | 'missed' | 'extra' | 'free'
  rides: { name: string; minutes: number; hm: string; km: number; avg_w: number | null; np_w: number | null; avg_hr: number | null; if: number | null; tss: number | null; decoupling_pct: number | null }[]
  rpe: number | null
}

export interface WeekFacts {
  week: { label: string; monday: string; sunday: string; phase: string | null; week_type: string | null }
  days: WeekDayFacts[]
  totals: { planned_min: number; planned_hm: string; done_min: number; done_hm: string; pct: number | null; rides: number; km: number; elevation_m: number; tss: number | null; key_planned: number; key_done: number; skipped: number; missed: number; extra: number }
  previous_week: { done_min: number; done_hm: string; rides: number; tss: number | null } | null
  derived: { minutes_change_pct: number | null; tss_change_pct: number | null; weight_change_kg: number | null; rhr_change_bpm: number | null }
  body: { weights: { date: string; kg: number }[]; weight_first: number | null; weight_last: number | null; rhr_avg: number | null; rhr_prev_avg: number | null; legs_avg: number | null; sleep_avg: number | null; motivation_avg: number | null; sick_days: number; checkins: number }
  /** sygnały z kryteriów luzowania (docs/13): same stwierdzenia, bez liczb spoza faktów */
  flags: string[]
  next_week: { days: { date: string; weekday: string; name: string; minutes: number; hm: string; day_type: string }[]; total_min: number; total_hm: string; key: string | null; has_test: boolean; week_type: string | null } | null
  athlete: { ftp: number | null; lthr: number | null; goal: string | null; coach_notes: string[] }
}

const WD = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return addDays(iso, -((d.getUTCDay() + 6) % 7))
}
const weekday = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()]!
const r1 = (x: number) => Math.round(x * 10) / 10
const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
export const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`)

export function weekLabel(monday: string): string {
  const sun = addDays(monday, 6)
  const [, m1, d1] = monday.split('-')
  const [, m2, d2] = sun.split('-')
  return m1 === m2 ? `${Number(d1)}–${Number(d2)}.${m2}` : `${Number(d1)}.${m1}–${Number(d2)}.${m2}`
}

export function weekFacts(inp: WeekInput): WeekFacts {
  const sunday = addDays(inp.monday, 6)
  const snaps = inp.snapshots
  const latest = Object.values(snaps).find((s) => s && (s.ftp || s.lthr)) ?? null
  const ftp = latest?.ftp ?? null
  const zones = latest?.zones ?? []
  const load = (r: RideLite) => rideLoadLite(r, ftp, zones)

  const days: WeekDayFacts[] = []
  let planned_min = 0
  let done_min = 0
  let tssSum = 0
  let tssAny = false
  let km = 0
  let elev = 0
  let key_planned = 0
  let key_done = 0
  const counts = { skipped: 0, missed: 0, extra: 0, rides: 0 }
  for (let i = 0; i < 7; i++) {
    const date = addDays(inp.monday, i)
    const snap = snaps[date] ?? null
    const planned = snap?.planned ?? null
    const rides = inp.rides.filter((r) => r.date === date)
    const log = inp.logs.find((l) => l.date === date) ?? null
    const movingS = rides.reduce((a, r) => a + r.moving_time_s, 0)
    let outcome: WeekDayFacts['outcome']
    if (planned) {
      planned_min += planned.minutes
      if (planned.day_type === 'key') key_planned++
      if (log?.status === 'skipped' && !rides.length) outcome = 'skipped'
      else if (!rides.length) outcome = 'missed'
      else outcome = fulfilsPlan(movingS, planned.minutes) || log?.status === 'done' ? 'done' : 'modified'
      if (outcome === 'done' && planned.day_type === 'key') key_done++
    } else outcome = rides.length ? 'extra' : 'free'
    if (outcome === 'skipped') counts.skipped++
    if (outcome === 'missed') counts.missed++
    if (outcome === 'extra') counts.extra++
    counts.rides += rides.length
    done_min += Math.round(movingS / 60)
    const dr = rides.map((r) => {
      const l = load(r)
      if (l) {
        tssSum += l.tss
        tssAny = true
      }
      km += r.distance_m / 1000
      elev += r.elevation_m
      return { name: r.name, minutes: Math.round(r.moving_time_s / 60), hm: hm(Math.round(r.moving_time_s / 60)), km: r1(r.distance_m / 1000), avg_w: r.device_watts ? (r.avg_watts ?? null) : null, np_w: r.device_watts ? (r.np_w ?? null) : null, avg_hr: r.avg_hr ?? null, if: l?.if ?? null, tss: l?.tss ?? null, decoupling_pct: r.decoupling_pct ?? null }
    })
    days.push({ date, weekday: weekday(date), planned: planned ? { ...planned, hm: hm(planned.minutes) } : null, outcome, rides: dr, rpe: log?.rpe ?? null })
  }

  const prevMin = Math.round(inp.prevRides.reduce((a, r) => a + r.moving_time_s, 0) / 60)
  let prevTss = 0
  let prevTssAny = false
  for (const r of inp.prevRides) {
    const l = load(r)
    if (l) {
      prevTss += l.tss
      prevTssAny = true
    }
  }
  const previous_week = inp.prevRides.length ? { done_min: prevMin, done_hm: hm(prevMin), rides: inp.prevRides.length, tss: prevTssAny ? prevTss : null } : null

  const ci = inp.checkins.filter((c) => c.date >= inp.monday && c.date <= sunday).sort((a, b) => a.date.localeCompare(b.date))
  const weights = ci.filter((c) => c.weight_kg != null).map((c) => ({ date: c.date, kg: r1(c.weight_kg!) }))
  const prevW = inp.prevCheckins.filter((c) => c.weight_kg != null).sort((a, b) => a.date.localeCompare(b.date))
  const weight_first = weights[0]?.kg ?? null
  const weight_last = weights.at(-1)?.kg ?? null
  const prevLast = prevW.at(-1)?.weight_kg ?? null
  const rhr = ci.filter((c) => c.resting_hr != null).map((c) => c.resting_hr!)
  const rhrPrev = inp.prevCheckins.filter((c) => c.resting_hr != null).map((c) => c.resting_hr!)
  const body = {
    weights,
    weight_first,
    weight_last,
    rhr_avg: avg(rhr),
    rhr_prev_avg: avg(rhrPrev),
    legs_avg: avg(ci.filter((c) => c.legs != null).map((c) => c.legs!)),
    sleep_avg: avg(ci.filter((c) => c.sleep != null).map((c) => c.sleep!)),
    motivation_avg: avg(ci.filter((c) => c.motivation != null).map((c) => c.motivation!)),
    sick_days: ci.filter((c) => c.sick).length,
    checkins: ci.length,
  }

  // kryteria luzowania (docs/13 § Zmiana 30.09 / pamięć „blok mocny”): tylko stwierdzenia, liczby są w body
  const flags: string[] = []
  if (body.rhr_avg != null && body.rhr_prev_avg != null && body.rhr_avg - body.rhr_prev_avg >= 5) flags.push('tętno spoczynkowe wyraźnie wyżej niż tydzień temu')
  const lowLegs = ci.filter((c) => c.legs != null && c.legs <= 2).length
  if (lowLegs >= 2) flags.push('nogi ocenione na 1–2 co najmniej dwa razy')
  if (body.sick_days > 0) flags.push('w tygodniu była choroba')
  if (counts.missed >= 2) flags.push('dwa lub więcej treningów bez jazdy i bez oznaczenia')
  if (previous_week && previous_week.done_min > 0 && done_min > previous_week.done_min * 1.3 && done_min - previous_week.done_min > 90) flags.push('objętość skoczyła o ponad 30 % względem poprzedniego tygodnia')
  if (body.checkins <= 2) flags.push('mało check-inów – trener nie widzi samopoczucia')

  const nextMonday = addDays(inp.monday, 7)
  const nd: NonNullable<WeekFacts['next_week']>['days'] = []
  let nextType: string | null = null
  for (let i = 0; i < 7; i++) {
    const date = addDays(nextMonday, i)
    const s = snaps[date]
    if (!s?.planned) continue
    nd.push({ date, weekday: weekday(date), name: s.planned.name, minutes: s.planned.minutes, hm: hm(s.planned.minutes), day_type: s.planned.day_type })
    nextType ??= s.context?.week_type ?? null
  }
  const next_week = nd.length ? { days: nd, total_min: nd.reduce((a, d) => a + d.minutes, 0), total_hm: hm(nd.reduce((a, d) => a + d.minutes, 0)), key: nd.find((d) => d.day_type === 'key')?.name ?? null, has_test: nd.some((d) => d.day_type === 'test' || /test/i.test(d.name)), week_type: nextType } : null

  const ctx = days.map((d) => snaps[d.date]?.context).find(Boolean) ?? null
  return {
    week: { label: weekLabel(inp.monday), monday: inp.monday, sunday, phase: ctx?.phase ?? null, week_type: ctx?.week_type ?? null },
    days,
    totals: { planned_min, planned_hm: hm(planned_min), done_min, done_hm: hm(done_min), pct: planned_min > 0 ? Math.round((done_min / planned_min) * 100) : null, rides: counts.rides, km: Math.round(km), elevation_m: Math.round(elev), tss: tssAny ? tssSum : null, key_planned, key_done, skipped: counts.skipped, missed: counts.missed, extra: counts.extra },
    previous_week,
    derived: {
      minutes_change_pct: previous_week ? pct(done_min, previous_week.done_min) : null,
      tss_change_pct: previous_week?.tss != null && tssAny ? pct(tssSum, previous_week.tss) : null,
      weight_change_kg: weight_last != null && prevLast != null ? r1(weight_last - prevLast) : weight_last != null && weight_first != null && weights.length > 1 ? r1(weight_last - weight_first) : null,
      rhr_change_bpm: body.rhr_avg != null && body.rhr_prev_avg != null ? r1(body.rhr_avg - body.rhr_prev_avg) : null,
    },
    body,
    flags,
    next_week,
    athlete: { ftp, lthr: latest?.lthr ?? null, goal: ctx?.goal ?? null, coach_notes: ctx?.coach_notes ?? [] },
  }
}

export const WEEK_SYSTEM = `Jesteś trenerem kolarskim tego zawodnika i piszesz mu w niedzielę wieczorem krótki list po tygodniu – jak trener, który zna jego dane, a nie jak raport.
Zasady: piszesz po polsku, bezpośrednio do zawodnika (per „Ty”), 8–12 zdań w 3 akapitach: (1) co się wydarzyło i jak to oceniasz, (2) ciało – masa, tętno spoczynkowe, samopoczucie – i czy coś niepokoi, (3) następny tydzień: na czym się skupić i co jest najważniejszym treningiem.
Każda liczba, której użyjesz, musi być w FAKTACH dokładnie w tej postaci (minuty możesz podać jako godziny i minuty); porównania bierzesz wyłącznie z „derived”, nie liczysz nic sam. Jeśli w „flags” coś jest, mówisz o tym wprost i proponujesz reakcję (3–4 dni lżej, obserwacja), ale nie zmieniasz planu.
Trzeci akapit zawsze nazywa następny tydzień konkretnie: ile treningów i łącznie ile czasu („next_week.total_hm”), który trening jest najważniejszy („next_week.key”), a jeśli „next_week.has_test” jest true – że to tydzień z testem i ostatnie 2–3 dni przed nim mają być lekkie. Jeśli „next_week” jest null, napisz, że planu na następny tydzień jeszcze nie widzisz.
Liczby dziesiętne piszesz z przecinkiem (140,6 km; 7,4 %), nigdy z kropką. Bez emoji, bez nagłówków, bez wypunktowań, bez pochlebstw na siłę. Konkret zamiast ogólników. Nie powtarzaj liczb, które i tak są w tabeli pod listem (łączny czas, TSS) więcej niż raz.`

export function weekPrompt(f: WeekFacts): string {
  return `FAKTY (JSON):\n${JSON.stringify(f)}\n\nNapisz list.`
}

export function wordCount(t: string): number {
  return t.split(/\s+/).filter(Boolean).length
}

const pl = (x: number, d = 1) => x.toFixed(d).replace('.', ',')

/** List z reguł – gdy model niedostępny albo szkic nie przeszedł weryfikacji liczb. */
export function ruleLetter(f: WeekFacts): string {
  const t = f.totals
  const p1: string[] = []
  p1.push(t.planned_min > 0 ? `W tygodniu ${f.week.label} zrobiłeś ${hm(t.done_min)} z ${hm(t.planned_min)} planu${t.pct != null ? ` (${t.pct} %)` : ''}, ${t.rides} ${t.rides === 1 ? 'jazdę' : t.rides < 5 ? 'jazdy' : 'jazd'}, ${t.km} km.` : `W tygodniu ${f.week.label} zrobiłeś ${hm(t.done_min)} w ${t.rides} jazdach, ${t.km} km.`)
  if (t.key_planned) p1.push(t.key_done === t.key_planned ? 'Treningi kluczowe wykonane.' : `Z treningów kluczowych wykonane ${t.key_done} z ${t.key_planned}.`)
  if (t.missed) p1.push(`${t.missed === 1 ? 'Jeden trening wypadł' : `${t.missed} treningi wypadły`} bez oznaczenia – jeśli to decyzja, oznacz dzień jako pominięty.`)
  if (f.previous_week && f.derived.minutes_change_pct != null) p1.push(`Względem poprzedniego tygodnia objętość ${f.derived.minutes_change_pct >= 0 ? 'wzrosła' : 'spadła'} o ${Math.abs(f.derived.minutes_change_pct)} %.`)
  const p2: string[] = []
  if (f.body.weight_last != null) p2.push(`Masa ${pl(f.body.weight_last)} kg${f.derived.weight_change_kg != null ? ` (${f.derived.weight_change_kg > 0 ? '+' : ''}${pl(f.derived.weight_change_kg)} kg)` : ''}.`)
  if (f.body.rhr_avg != null) p2.push(`Tętno spoczynkowe średnio ${pl(f.body.rhr_avg)} bpm${f.derived.rhr_change_bpm != null ? `, ${f.derived.rhr_change_bpm > 0 ? '+' : ''}${pl(f.derived.rhr_change_bpm)} względem poprzedniego tygodnia` : ''}.`)
  if (f.body.legs_avg != null) p2.push(`Nogi średnio ${pl(f.body.legs_avg)}/5.`)
  if (f.body.checkins === 0) p2.push('Bez check-inów w tym tygodniu – nie widzę masy ani samopoczucia.')
  for (const fl of f.flags) p2.push(`Uwaga: ${fl}.`)
  const p3: string[] = []
  if (f.next_week) {
    p3.push(`Następny tydzień: ${f.next_week.days.length} ${f.next_week.days.length === 1 ? 'trening' : f.next_week.days.length < 5 ? 'treningi' : 'treningów'}, ${hm(f.next_week.total_min)}${f.next_week.key ? `, najważniejszy: ${f.next_week.key}` : ''}.`)
    if (f.next_week.has_test) p3.push('W planie jest test – ostatnie dni przed nim lekko, na świeżo.')
  }
  return [p1.join(' '), p2.join(' '), p3.join(' ')].filter(Boolean).join('\n\n')
}
