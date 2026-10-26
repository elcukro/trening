import { useEffect, useState, type ReactNode } from 'react'
import { WEEKDAYS, addDays, type Weekday } from '@/engine/dates'
import { CONSENT_VERSION, DEVICES, DISCIPLINES, FIXED_KINDS, GOAL_TYPES, HEALTH_QUESTIONS, TRAINERS, YEARS, checks, healthScreen, isWeekend, withDays, withGoalType, type Draft, type Goal, type Step } from '@/engine/onboarding'
import { haptic, health } from '@/native'
import type { HealthProfile } from '@/day/health'
import { birthMax, bodyFromHealth, type BodyField } from '@/day/onboarding'
import { Chips, DateRow, Field, Options, PickRow, YesNo, range } from './controls'
import { hours, minutes } from './labels'
import { useT } from '@/i18n/react'
import { num } from '@/lib/format'

/** Treść kroków onboardingu (docs/31). Każdy krok dostaje szkic i `set`; walidację robi `stepValid` w silniku. */

/**
 * `update` – zmiana od bieżącego szkicu (odczyt asynchroniczny, np. Zdrowie, nie gubi wyborów z międzyczasu).
 * `place` – gdzie w tym wyglądzie zmienia się odpowiedzi („Ja → Ty i Twój cel”).
 */
export type StepProps = { d: Draft; set: (d: Draft) => void; update: (fn: (d: Draft) => Draft) => void; today: string; place: string }

/** Ilustracja każdego kroku; tytuł i „po co pytamy” są w słowniku (`onboarding.stepHead`). */
export const STEP_ART: Record<Step, string> = {
  time: '/m/art/ob-time.png',
  time_detail: '/m/art/ob-time.png',
  current: '/m/art/ob-form.png',
  measure: '/m/art/ob-measure.png',
  gear: '/m/art/ob-gear.png',
  consent: '/m/art/ob-consent.png',
  body: '/m/art/ob-body.png',
  health: '/m/art/ob-health.png',
  goal: '/m/art/ob-goal.png',
  goal_detail: '/m/art/ob-goal.png',
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }))

/* ------------------------------------------------------------------ czas */

function TimeStep({ d, set }: StepProps) {
  const o = useT().onboarding
  const t = d.time ?? {}
  return (
    <>
      <div className="m-list">
        <PickRow label={o.steps.time.hoursPerWeek} value={t.hours_per_week} options={range(1, 20, 0.5)} format={hours} onChange={(v) => set({ ...d, time: { ...t, hours_per_week: v ?? undefined } })} />
      </div>
      <Field label={o.steps.time.daysQuestion}>
        <div className="ob-days" role="group" aria-label={o.steps.time.daysAria}>
          {WEEKDAYS.map((day) => {
            const on = (t.days ?? []).includes(day)
            return (
              <button
                key={day}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={o.dayLong[day]}
                onClick={() => {
                  haptic.selection()
                  set(withDays(d, on ? (t.days ?? []).filter((x) => x !== day) : [...(t.days ?? []), day]))
                }}
              >
                {o.dayShort[day]}
              </button>
            )
          })}
        </div>
      </Field>
    </>
  )
}

function TimeDetailStep({ d, set }: StepProps) {
  const o = useT().onboarding
  const t = d.time ?? {}
  const days = t.days ?? []
  const weekdays = days.some((x) => !isWeekend(x))
  const weekend = days.some(isWeekend)
  const fixedOf = (day: Weekday) => t.fixed?.find((f) => f.day === day)?.kind ?? null
  return (
    <>
      <Field label={o.steps.timeDetail.longest}>
        <div className="m-list">
          {weekdays && <PickRow label={o.steps.timeDetail.weekday} value={t.weekday_max_min} options={[30, 45, 60, 75, 90, 120, 150, 180, 240]} format={minutes} onChange={(v) => set({ ...d, time: { ...t, weekday_max_min: v ?? undefined } })} />}
          {weekend && <PickRow label={o.steps.timeDetail.weekend} value={t.weekend_max_min} options={range(60, 480, 30)} format={minutes} onChange={(v) => set({ ...d, time: { ...t, weekend_max_min: v ?? undefined } })} />}
        </div>
      </Field>
      <Field label={o.steps.timeDetail.fixed} foot={o.steps.timeDetail.fixedFoot}>
        <div className="m-list">
          {days.map((day) => (
            <PickRow
              key={day}
              label={o.dayLong[day]}
              value={fixedOf(day)}
              options={FIXED_KINDS}
              format={(k) => o.fixed[k]}
              placeholder="—"
              optional
              onChange={(kind) => {
                const rest = (t.fixed ?? []).filter((f) => f.day !== day)
                set({ ...d, time: { ...t, fixed: kind ? [...rest, { day, kind }].toSorted((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day)) : rest } })
              }}
            />
          ))}
        </div>
      </Field>
    </>
  )
}

/* ------------------------------------------------------------------ forma, pomiar, sprzęt */

function CurrentStep({ d, set }: StepProps) {
  const o = useT().onboarding
  const s = o.steps.current
  const c = d.current ?? {}
  const put = (p: Partial<NonNullable<Draft['current']>>) => set({ ...d, current: { ...c, ...p } })
  return (
    <>
      <Field label={s.hours}>
        <Chips label={s.hoursAria} options={[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((v) => ({ value: v, label: v === 0 ? s.noRiding : v === 15 ? '15 h+' : hours(v) }))} value={c.hours_4w} onChange={(v) => put({ hours_4w: v as number })} />
      </Field>
      <Field label={s.longest}>
        <Chips label={s.longestAria} options={[0, 30, 60, 90, 120, 180, 240, 300, 360].map((v) => ({ value: v, label: v === 0 ? s.none : v === 360 ? '6 h+' : minutes(v) }))} value={c.longest_ride_min} onChange={(v) => put({ longest_ride_min: v as number })} />
      </Field>
      <Field label={s.years}>
        <Chips label={s.yearsAria} options={opts(YEARS, o.years)} value={c.years} onChange={(v) => put({ years: v as (typeof YEARS)[number] })} />
      </Field>
    </>
  )
}

function MeasureStep({ d, set }: StepProps) {
  const s = useT().onboarding.steps.measure
  const m = d.measure ?? {}
  const put = (p: Partial<NonNullable<Draft['measure']>>) => set({ ...d, measure: { ...m, ...p } })
  return (
    <>
      <Options
        label={s.aria}
        value={m.level}
        onChange={(level) => put({ level })}
        options={[
          { value: 'power', ...s.power },
          { value: 'hr', ...s.hr },
          { value: 'rpe', ...s.rpe },
        ]}
      />
      {m.level && m.level !== 'rpe' && (
        <Field label={s.thresholds} foot={s.thresholdsFoot}>
          <div className="m-list">
            {m.level === 'power' && <PickRow label={s.ftp} value={m.ftp_w ?? null} options={range(100, 450, 5)} format={(v) => `${v} W`} placeholder={s.dontKnow} optional onChange={(v) => put({ ftp_w: v })} />}
            <PickRow label={s.lthr} value={m.lthr_bpm ?? null} options={range(120, 200)} format={(v) => `${v} bpm`} placeholder={s.dontKnow} optional onChange={(v) => put({ lthr_bpm: v })} />
            <PickRow label={s.hrMax} value={m.hr_max_bpm ?? null} options={range(150, 215)} format={(v) => `${v} bpm`} placeholder={s.dontKnow} optional onChange={(v) => put({ hr_max_bpm: v })} />
          </div>
        </Field>
      )}
    </>
  )
}

function GearStep({ d, set }: StepProps) {
  const o = useT().onboarding
  const s = o.steps.gear
  const g = d.gear ?? {}
  const put = (p: Partial<NonNullable<Draft['gear']>>) => set({ ...d, gear: { ...g, ...p } })
  return (
    <>
      <Field label={s.disciplines}>
        <Chips multi label={s.disciplinesAria} options={opts(DISCIPLINES, o.discipline)} value={g.disciplines} onChange={(v) => put({ disciplines: v as typeof g.disciplines })} />
      </Field>
      <Field label={s.bikes}>
        <Chips multi label={s.bikesAria} options={opts(DISCIPLINES, o.bike)} value={g.bikes} onChange={(v) => put({ bikes: v as typeof g.bikes })} />
      </Field>
      <Field label={s.trainer}>
        <Chips label={s.trainer} options={opts(TRAINERS, o.trainer)} value={g.trainer} onChange={(v) => put({ trainer: v as typeof g.trainer })} />
      </Field>
      <Field label={s.devices} foot={s.devicesFoot}>
        <Chips multi label={s.devicesAria} options={opts(DEVICES, o.device)} value={g.devices ?? []} onChange={(v) => put({ devices: v as typeof g.devices })} />
      </Field>
    </>
  )
}

/* ------------------------------------------------------------------ zgoda, ciało, zdrowie */

function ConsentStep({ d, set, place }: StepProps) {
  const t = useT()
  const s = t.onboarding.steps.consent
  const on = d.consent?.health_data === true
  return (
    <>
      <div className="m-card flex flex-col gap-3 p-5">
        <p className="m-sub">{s.intro}</p>
        <ul className="ob-bullets m-sub">
          <li>{s.onlyPlan}</li>
          <li>{s.noSale}</li>
          <li>{s.withdraw(place)}</li>
        </ul>
        <p className="m-foot m-dim">{s.notMedical(t.common.appName)}</p>
      </div>
      <div className="m-list">
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          className="m-row ob-option"
          onClick={() => {
            haptic.selection()
            set({ ...d, consent: on ? undefined : { health_data: true, at: new Date().toISOString(), version: CONSENT_VERSION } })
          }}
        >
          <span className="ob-check" aria-hidden data-on={on}>
            {on && '✓'}
          </span>
          <span className="flex-1">{s.agree}</span>
        </button>
      </div>
      {!on && <p className="m-foot m-dim px-1">{s.required}</p>}
    </>
  )
}

/** „wzrost”, „wzrost i masę”, „wzrost, masę i płeć” */
const joinAnd = (a: string[], and: string) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ${and} ${a.at(-1)}` : (a[0] ?? ''))

const BODY_FIELDS: readonly BodyField[] = ['height_cm', 'weight_kg', 'birth_date', 'sex']

function BodyStep({ d, set, update, today }: StepProps) {
  const s = useT().onboarding.steps.body
  const b = d.body ?? {}
  const put = (p: Partial<NonNullable<Draft['body']>>) => set({ ...d, body: { ...b, ...p } })
  // aplikacja iOS: po zgodzie (poprzedni krok) pytamy Zdrowie o uprawnienia i wypełniamy tylko puste pola
  const [hp, setHp] = useState<HealthProfile | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      if (!(await health.available())) return
      await health.authorize()
      const h = await health.readProfile()
      if (!alive || !h) return
      setHp(h)
      update((cur) => ({ ...cur, body: bodyFromHealth(cur.body, h, today).body }))
    })()
    return () => {
      alive = false
    }
  }, [update, today])
  // podpis znika, gdy zawodnik zmieni wartość
  const fromHealth = hp ? BODY_FIELDS.filter((f) => b[f] != null && b[f] === bodyFromHealth({}, hp, today).body[f]) : []
  return (
    <>
      {fromHealth.length > 0 && (
        <Notice tone="blue" title={s.fromHealthTitle}>
          {s.fromHealth(joinAnd(fromHealth.map((f) => s.field[f]), s.and))}
        </Notice>
      )}
      <div className="m-list">
        <PickRow label={s.height} value={b.height_cm ?? null} options={range(140, 210)} format={(v) => `${v} cm`} optional onChange={(v) => put({ height_cm: v })} />
        <PickRow label={s.weight} value={b.weight_kg ?? null} options={range(40, 150, 0.5)} format={(v) => `${num(v, 1)} kg`} optional onChange={(v) => put({ weight_kg: v })} />
        <DateRow label={s.birthDate} value={b.birth_date} min="1920-01-01" max={birthMax(today)} optional onChange={(v) => put({ birth_date: v })} />
      </div>
      <Field label={s.sex} foot={s.sexFoot}>
        <Chips label={s.sex} options={[{ value: 'female', label: s.female }, { value: 'male', label: s.male }, { value: 'none', label: s.noSex }]} value={b.sex === undefined ? undefined : (b.sex ?? 'none')} onChange={(v) => put({ sex: v === 'none' ? null : (v as 'female' | 'male') })} />
      </Field>
    </>
  )
}

function HealthStep({ d, set, place }: StepProps) {
  const o = useT().onboarding
  const s = o.steps.health
  const h = d.health ?? {}
  const screen = healthScreen(h)
  return (
    <>
      <div className="flex flex-col gap-3">
        {HEALTH_QUESTIONS.map((q) => (
          <div key={q} className="m-card flex flex-col gap-3 p-4">
            <p className="m-sub">{o.health[q]}</p>
            <YesNo
              label={o.health[q]}
              value={h[q]}
              onChange={(v) => {
                const next = { ...h, [q]: v }
                if (healthScreen(next).level === 'doctor' && screen.level !== 'doctor') haptic.warning()
                set({ ...d, health: next })
              }}
            />
          </div>
        ))}
      </div>
      {screen.level === 'doctor' && (
        <Notice tone="red" title={s.doctorTitle}>
          {s.doctor(place)}
        </Notice>
      )}
      {screen.level === 'caution' && (
        <Notice tone="orange" title={s.cautionTitle}>
          {s.caution}
        </Notice>
      )}
    </>
  )
}

export function Notice({ tone, title, children }: { tone: 'red' | 'orange' | 'blue'; title: string; children: ReactNode }) {
  return (
    <div className="ob-notice" data-tone={tone} role={tone === 'red' ? 'alert' : 'note'}>
      <p className="m-headline">{title}</p>
      <p className="m-sub mt-1">{children}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ cel */

function GoalStep({ d, set }: StepProps) {
  const o = useT().onboarding
  return <Options label={o.steps.goal.aria} value={d.goal?.type} onChange={(type) => set(withGoalType(d, type))} options={GOAL_TYPES.map((value) => ({ value, ...o.goal[value] }))} />
}

type GoalOf<T extends Goal['type']> = Partial<Extract<Goal, { type: T }>>

function GoalDetailStep({ d, set, today }: StepProps) {
  const o = useT().onboarding
  const L = o.steps.goalDetail
  const g = d.goal ?? {}
  const put = (p: Record<string, unknown>) => set({ ...d, goal: { ...g, ...p } as Draft['goal'] })
  const minDate = addDays(today, 7)
  const maxDate = addDays(today, 3 * 365)
  const warn = checks(d, today).filter((c) => ['goal_past', 'goal_soon', 'weight_rate', 'weight_up'].includes(c.id))
  let body: ReactNode = null
  switch (g.type) {
    case 'event': {
      const e = g as GoalOf<'event'>
      body = (
        <>
          <div className="m-list">
            <DateRow label={L.date} value={e.date} min={minDate} max={maxDate} onChange={(v) => put({ date: v ?? undefined })} />
            <label className="m-row">
              <span className="flex-1">{L.name}</span>
              <input className="ob-text" value={e.name ?? ''} placeholder={L.namePlaceholder} maxLength={80} enterKeyHint="done" onChange={(ev) => put({ name: ev.target.value || null })} aria-label={L.nameAria} />
            </label>
            <PickRow label={L.distance} value={e.distance_km} options={[...range(20, 300, 10), ...range(350, 1000, 50)]} format={(v) => `${v} km`} onChange={(v) => put({ distance_km: v ?? undefined })} />
            <PickRow label={L.elevation} value={e.elevation_m} options={[...range(0, 5000, 250), ...range(6000, 15000, 1000)]} format={(v) => `${num(v, 0)} m`} onChange={(v) => put({ elevation_m: v ?? undefined })} />
          </div>
          <Field label={L.surface}>
            <Chips label={L.surfaceAria} options={opts(DISCIPLINES, o.discipline)} value={e.discipline} onChange={(v) => put({ discipline: v })} />
          </Field>
          <Field label={L.success}>
            <Chips label={L.successAria} options={[{ value: 'finish', label: L.finish }, { value: 'time', label: L.inTime }]} value={e.target_time_min ? 'time' : 'finish'} onChange={(v) => put({ target_time_min: v === 'time' ? (e.target_time_min ?? Math.round(((e.distance_km ?? 100) / 25) * 60 / 30) * 30) : null })} />
            {e.target_time_min != null && (
              <div className="m-list">
                <PickRow label={L.targetTime} value={e.target_time_min} options={range(60, 1800, 30)} format={minutes} onChange={(v) => put({ target_time_min: v })} />
              </div>
            )}
          </Field>
        </>
      )
      break
    }
    case 'ftp': {
      const f = g as GoalOf<'ftp'>
      body = (
        <div className="m-list">
          <PickRow label={L.targetFtp} value={f.target_w} options={range(120, 450, 5)} format={(v) => `${v} W`} onChange={(v) => put({ target_w: v ?? undefined })} />
          <DateRow label={L.until} value={f.date} min={minDate} max={maxDate} optional onChange={(v) => put({ date: v })} />
        </div>
      )
      break
    }
    case 'speed': {
      const s = g as GoalOf<'speed'>
      body = (
        <>
          <div className="m-list">
            <PickRow label={L.avgSpeed} value={s.kmh} options={range(18, 40)} format={(v) => `${v} km/h`} onChange={(v) => put({ kmh: v ?? undefined })} />
            <DateRow label={L.until} value={s.date} min={minDate} max={maxDate} optional onChange={(v) => put({ date: v })} />
          </div>
          <Field label={L.forHours}>
            <Chips label={L.forHoursAria} options={[1, 1.5, 2, 2.5, 3, 4, 5, 6].map((v) => ({ value: v, label: hours(v) }))} value={s.hours} onChange={(v) => put({ hours: v })} />
          </Field>
        </>
      )
      break
    }
    case 'weight': {
      const w = g as GoalOf<'weight'>
      body = (
        <div className="m-list">
          <PickRow label={L.targetWeight} value={w.target_kg} options={range(45, 140, 0.5)} format={(v) => `${num(v, 1)} kg`} onChange={(v) => put({ target_kg: v ?? undefined })} />
          <DateRow label={L.until} value={w.date} min={minDate} max={maxDate} onChange={(v) => put({ date: v ?? undefined })} />
        </div>
      )
      break
    }
    case 'fitness': {
      const f = g as GoalOf<'fitness'>
      body = (
        <>
          <div className="m-list">
            <PickRow label={L.weeklyHours} value={f.weekly_hours} options={range(1, 20, 0.5)} format={hours} onChange={(v) => put({ weekly_hours: v ?? undefined })} />
          </div>
          <Field label={L.forWeeks}>
            <Chips label={L.forWeeksAria} options={[4, 8, 12, 16, 24, 52].map((v) => ({ value: v, label: L.weeksShort(v) }))} value={f.weeks} onChange={(v) => put({ weeks: v })} />
          </Field>
        </>
      )
      break
    }
    case 'comeback': {
      const c = g as GoalOf<'comeback'>
      body = (
        <>
          <Field label={L.breakLength}>
            <Chips label={L.breakAria} options={[2, 4, 8, 12, 26, 52, 104].map((v) => ({ value: v, label: v >= 52 ? L.years(v / 52) : L.weeksShort(v) }))} value={c.weeks_off} onChange={(v) => put({ weeks_off: v })} />
          </Field>
          <Field label={L.reason}>
            <Chips label={L.reasonAria} options={opts(['illness', 'injury', 'life', 'other'] as const, o.reason)} value={c.reason} onChange={(v) => put({ reason: v })} />
          </Field>
          <div className="m-list">
            <PickRow label={L.backTo} value={c.weekly_hours} options={range(1, 20, 0.5)} format={(v) => L.perWeek(hours(v))} onChange={(v) => put({ weekly_hours: v ?? undefined })} />
          </div>
        </>
      )
      break
    }
  }
  return (
    <>
      {body}
      {warn.map((c) => (
        <Notice key={c.id} tone={c.level === 'warn' ? 'orange' : 'blue'} title={c.level === 'warn' ? o.steps.warnTitle : o.steps.infoTitle}>
          {c.text}
        </Notice>
      ))}
    </>
  )
}

export const STEP_BODY: Record<Step, (p: StepProps) => ReactNode> = {
  time: TimeStep,
  time_detail: TimeDetailStep,
  current: CurrentStep,
  measure: MeasureStep,
  gear: GearStep,
  consent: ConsentStep,
  body: BodyStep,
  health: HealthStep,
  goal: GoalStep,
  goal_detail: GoalDetailStep,
}
