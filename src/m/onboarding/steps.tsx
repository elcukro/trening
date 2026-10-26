import type { ReactNode } from 'react'
import { WEEKDAYS, addDays, type Weekday } from '@/engine/dates'
import { CONSENT_VERSION, DEVICES, DISCIPLINES, FIXED_KINDS, GOAL_TYPES, HEALTH_QUESTIONS, TRAINERS, YEARS, checks, healthScreen, isWeekend, withDays, withGoalType, type Draft, type Goal, type Step } from '@/engine/onboarding'
import { haptic } from '@/native'
import { Chips, DateRow, Field, Options, PickRow, YesNo, range } from './controls'
import { BIKE_LABEL, DAY_LONG, DAY_SHORT, DEVICE_LABEL, DISCIPLINE_LABEL, FIXED_LABEL, GOAL_LABEL, HEALTH_TEXT, REASON_LABEL, TRAINER_LABEL, YEARS_LABEL, hours, minutes } from './labels'

/** Treść kroków onboardingu (docs/31). Każdy krok dostaje szkic i `set`; walidację robi `stepValid` w silniku. */

export type StepProps = { d: Draft; set: (d: Draft) => void; today: string }

/** Ilustracja, tytuł i „po co pytamy” każdego kroku. */
export const STEP_HEAD: Record<Step, { art: string; title: string; sub: string }> = {
  time: { art: '/m/art/ob-time.png', title: 'Ile czasu masz na rower?', sub: 'Od tego zależy cały plan – lepiej podać mniej i dotrzymać.' },
  time_detail: { art: '/m/art/ob-time.png', title: 'Jak wygląda Twój tydzień?', sub: 'Ile najdłużej możesz jechać w jeden dzień i co jest stałe.' },
  current: { art: '/m/art/ob-form.png', title: 'Gdzie jesteś teraz?', sub: 'Plan zacznie od Twojej obecnej objętości, nie od zera i nie od razu od celu.' },
  measure: { art: '/m/art/ob-measure.png', title: 'Czym mierzysz wysiłek?', sub: 'Od tego zależy język planu: waty, tętno albo odczucie.' },
  gear: { art: '/m/art/ob-gear.png', title: 'Na czym jeździsz?', sub: 'Dobierzemy treningi do roweru i wyślemy je na Twoje urządzenie.' },
  consent: { art: '/m/art/ob-consent.png', title: 'Twoje dane o zdrowiu', sub: 'Zanim zapytamy o ciało i zdrowie – krótko, co z nimi robimy.' },
  body: { art: '/m/art/ob-body.png', title: 'Kilka liczb o Tobie', sub: 'Do budżetu kalorii i stref. Każde pole możesz pominąć.' },
  health: { art: '/m/art/ob-health.png', title: 'Kilka pytań o zdrowie', sub: 'Jak przed każdym planem treningowym. Od odpowiedzi zależy, czy plan może mieć mocne interwały.' },
  goal: { art: '/m/art/ob-goal.png', title: 'Jaki masz cel?', sub: 'Jeden główny. Drugi dodasz później.' },
  goal_detail: { art: '/m/art/ob-goal.png', title: 'Opisz cel liczbami', sub: 'Mierzalne kryterium – żeby trener mógł powiedzieć „idzie dobrze” albo „trzeba zmienić”.' },
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }))

/* ------------------------------------------------------------------ czas */

function TimeStep({ d, set }: StepProps) {
  const t = d.time ?? {}
  return (
    <>
      <div className="m-list">
        <PickRow label="Godzin w tygodniu" value={t.hours_per_week} options={range(1, 20, 0.5)} format={hours} onChange={(v) => set({ ...d, time: { ...t, hours_per_week: v ?? undefined } })} />
      </div>
      <Field label="W które dni możesz jeździć?">
        <div className="ob-days" role="group" aria-label="Dni">
          {WEEKDAYS.map((day) => {
            const on = (t.days ?? []).includes(day)
            return (
              <button
                key={day}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={DAY_LONG[day]}
                onClick={() => {
                  haptic.selection()
                  set(withDays(d, on ? (t.days ?? []).filter((x) => x !== day) : [...(t.days ?? []), day]))
                }}
              >
                {DAY_SHORT[day]}
              </button>
            )
          })}
        </div>
      </Field>
    </>
  )
}

function TimeDetailStep({ d, set }: StepProps) {
  const t = d.time ?? {}
  const days = t.days ?? []
  const weekdays = days.some((x) => !isWeekend(x))
  const weekend = days.some(isWeekend)
  const fixedOf = (day: Weekday) => t.fixed?.find((f) => f.day === day)?.kind ?? null
  return (
    <>
      <Field label="Najdłuższa jazda, na jaką masz czas">
        <div className="m-list">
          {weekdays && <PickRow label="W dzień roboczy" value={t.weekday_max_min} options={[30, 45, 60, 75, 90, 120, 150, 180, 240]} format={minutes} onChange={(v) => set({ ...d, time: { ...t, weekday_max_min: v ?? undefined } })} />}
          {weekend && <PickRow label="W weekend" value={t.weekend_max_min} options={range(60, 480, 30)} format={minutes} onChange={(v) => set({ ...d, time: { ...t, weekend_max_min: v ?? undefined } })} />}
        </div>
      </Field>
      <Field label="Stałe punkty tygodnia (opcjonalnie)" foot="Np. sobotnia jazda z klubem – plan jej nie przesunie.">
        <div className="m-list">
          {days.map((day) => (
            <PickRow
              key={day}
              label={DAY_LONG[day]}
              value={fixedOf(day)}
              options={FIXED_KINDS}
              format={(k) => FIXED_LABEL[k]}
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
  const c = d.current ?? {}
  const put = (p: Partial<NonNullable<Draft['current']>>) => set({ ...d, current: { ...c, ...p } })
  return (
    <>
      <Field label="Ostatnie 4 tygodnie – średnio w tygodniu">
        <Chips label="Godziny w ostatnich 4 tygodniach" options={[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((v) => ({ value: v, label: v === 0 ? 'nie jeżdżę' : v === 15 ? '15 h+' : hours(v) }))} value={c.hours_4w} onChange={(v) => put({ hours_4w: v as number })} />
      </Field>
      <Field label="Najdłuższa jazda w ostatnim miesiącu">
        <Chips label="Najdłuższa jazda" options={[0, 30, 60, 90, 120, 180, 240, 300, 360].map((v) => ({ value: v, label: v === 0 ? 'brak' : v === 360 ? '6 h+' : minutes(v) }))} value={c.longest_ride_min} onChange={(v) => put({ longest_ride_min: v as number })} />
      </Field>
      <Field label="Od ilu lat jeździsz regularnie?">
        <Chips label="Lata jazdy" options={opts(YEARS, YEARS_LABEL)} value={c.years} onChange={(v) => put({ years: v as (typeof YEARS)[number] })} />
      </Field>
    </>
  )
}

function MeasureStep({ d, set }: StepProps) {
  const m = d.measure ?? {}
  const put = (p: Partial<NonNullable<Draft['measure']>>) => set({ ...d, measure: { ...m, ...p } })
  return (
    <>
      <Options
        label="Poziom pomiaru"
        value={m.level}
        onChange={(level) => put({ level })}
        options={[
          { value: 'power', title: 'Miernik mocy', sub: 'Plan w watach i % FTP' },
          { value: 'hr', title: 'Pas albo zegarek z tętnem', sub: 'Plan w bpm i strefach tętna' },
          { value: 'rpe', title: 'Bez urządzeń', sub: 'Plan na odczucie: wysiłek 1–10 i czas' },
        ]}
      />
      {m.level && m.level !== 'rpe' && (
        <Field label="Progi, jeśli znasz" foot="Nie znasz? Nic nie szkodzi – w pierwszych tygodniach będzie test.">
          <div className="m-list">
            {m.level === 'power' && <PickRow label="FTP" value={m.ftp_w ?? null} options={range(100, 450, 5)} format={(v) => `${v} W`} placeholder="nie wiem" optional onChange={(v) => put({ ftp_w: v })} />}
            <PickRow label="Tętno progowe (LTHR)" value={m.lthr_bpm ?? null} options={range(120, 200)} format={(v) => `${v} bpm`} placeholder="nie wiem" optional onChange={(v) => put({ lthr_bpm: v })} />
            <PickRow label="Tętno maksymalne" value={m.hr_max_bpm ?? null} options={range(150, 215)} format={(v) => `${v} bpm`} placeholder="nie wiem" optional onChange={(v) => put({ hr_max_bpm: v })} />
          </div>
        </Field>
      )}
    </>
  )
}

function GearStep({ d, set }: StepProps) {
  const g = d.gear ?? {}
  const put = (p: Partial<NonNullable<Draft['gear']>>) => set({ ...d, gear: { ...g, ...p } })
  return (
    <>
      <Field label="Co chcesz trenować?">
        <Chips multi label="Dyscypliny" options={opts(DISCIPLINES, DISCIPLINE_LABEL)} value={g.disciplines} onChange={(v) => put({ disciplines: v as typeof g.disciplines })} />
      </Field>
      <Field label="Twoje rowery">
        <Chips multi label="Rowery" options={opts(DISCIPLINES, BIKE_LABEL)} value={g.bikes} onChange={(v) => put({ bikes: v as typeof g.bikes })} />
      </Field>
      <Field label="Trenażer">
        <Chips label="Trenażer" options={opts(TRAINERS, TRAINER_LABEL)} value={g.trainer} onChange={(v) => put({ trainer: v as typeof g.trainer })} />
      </Field>
      <Field label="Komputer albo zegarek" foot="Nic nie zaznaczysz = bez urządzenia, plan zobaczysz w aplikacji.">
        <Chips multi label="Urządzenia" options={opts(DEVICES, DEVICE_LABEL)} value={g.devices ?? []} onChange={(v) => put({ devices: v as typeof g.devices })} />
      </Field>
    </>
  )
}

/* ------------------------------------------------------------------ zgoda, ciało, zdrowie */

function ConsentStep({ d, set }: StepProps) {
  const on = d.consent?.health_data === true
  return (
    <>
      <div className="m-card flex flex-col gap-3 p-5">
        <p className="m-sub">Żeby dobrać obciążenie, zapiszemy dane o zdrowiu: masę ciała, tętno i odpowiedzi o samopoczuciu i chorobach. To dane szczególnej kategorii (art. 9 RODO), więc potrzebujemy Twojej wyraźnej zgody.</p>
        <ul className="ob-bullets m-sub">
          <li>Służą tylko do układania i poprawiania Twojego planu.</li>
          <li>Nie sprzedajemy ich i nie pokazujemy innym osobom.</li>
          <li>Zgodę wycofasz w każdej chwili: Ja → Twoje potrzeby → Usuń moje odpowiedzi.</li>
        </ul>
        <p className="m-foot m-dim">Aplikacja nie jest narzędziem medycznym – wskazówki o zdrowiu i żywieniu mają charakter ogólny.</p>
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
          <span className="flex-1">Zgadzam się na przetwarzanie moich danych o zdrowiu w celu ułożenia planu treningowego</span>
        </button>
      </div>
      {!on && <p className="m-foot m-dim px-1">Bez tej zgody nie ułożymy planu. Możesz wrócić do tego później.</p>}
    </>
  )
}

function BodyStep({ d, set, today }: StepProps) {
  const b = d.body ?? {}
  const put = (p: Partial<NonNullable<Draft['body']>>) => set({ ...d, body: { ...b, ...p } })
  return (
    <>
      <div className="m-list">
        <PickRow label="Wzrost" value={b.height_cm ?? null} options={range(140, 210)} format={(v) => `${v} cm`} optional onChange={(v) => put({ height_cm: v })} />
        <PickRow label="Masa ciała" value={b.weight_kg ?? null} options={range(40, 150, 0.5)} format={(v) => `${String(v).replace('.', ',')} kg`} optional onChange={(v) => put({ weight_kg: v })} />
        <DateRow label="Data urodzenia" value={b.birth_date} min="1920-01-01" max={addDays(today, -16 * 365)} optional onChange={(v) => put({ birth_date: v })} />
      </div>
      <Field label="Płeć" foot="Do wzoru na zapotrzebowanie kalorii.">
        <Chips label="Płeć" options={[{ value: 'female', label: 'Kobieta' }, { value: 'male', label: 'Mężczyzna' }, { value: 'none', label: 'Nie podaję' }]} value={b.sex === undefined ? undefined : (b.sex ?? 'none')} onChange={(v) => put({ sex: v === 'none' ? null : (v as 'female' | 'male') })} />
      </Field>
    </>
  )
}

function HealthStep({ d, set }: StepProps) {
  const h = d.health ?? {}
  const screen = healthScreen(h)
  return (
    <>
      <div className="flex flex-col gap-3">
        {HEALTH_QUESTIONS.map((q) => (
          <div key={q} className="m-card flex flex-col gap-3 p-4">
            <p className="m-sub">{HEALTH_TEXT[q]}</p>
            <YesNo
              label={HEALTH_TEXT[q]}
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
        <Notice tone="red" title="Najpierw lekarz">
          Zanim zaczniesz treningi z mocnymi interwałami i testami, porozmawiaj z lekarzem. Do tego czasu plan będzie tylko spokojny. Gdy lekarz pozwoli, zmienisz odpowiedź w Ja → Twoje potrzeby.
        </Notice>
      )}
      {screen.level === 'caution' && (
        <Notice tone="orange" title="Będziemy ostrożni">
          Plan zacznie łagodniej i bez testów maksymalnych. Jeśli masz wątpliwości, zapytaj lekarza, czy możesz trenować.
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
  return <Options label="Cel" value={d.goal?.type} onChange={(type) => set(withGoalType(d, type))} options={GOAL_TYPES.map((value) => ({ value, ...GOAL_LABEL[value] }))} />
}

type GoalOf<T extends Goal['type']> = Partial<Extract<Goal, { type: T }>>

function GoalDetailStep({ d, set, today }: StepProps) {
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
            <DateRow label="Data" value={e.date} min={minDate} max={maxDate} onChange={(v) => put({ date: v ?? undefined })} />
            <label className="m-row">
              <span className="flex-1">Nazwa</span>
              <input className="ob-text" value={e.name ?? ''} placeholder="opcjonalnie" maxLength={80} enterKeyHint="done" onChange={(ev) => put({ name: ev.target.value || null })} aria-label="Nazwa wydarzenia" />
            </label>
            <PickRow label="Dystans" value={e.distance_km} options={[...range(20, 300, 10), ...range(350, 1000, 50)]} format={(v) => `${v} km`} onChange={(v) => put({ distance_km: v ?? undefined })} />
            <PickRow label="Przewyższenie" value={e.elevation_m} options={[...range(0, 5000, 250), ...range(6000, 15000, 1000)]} format={(v) => `${v.toLocaleString('pl-PL')} m`} onChange={(v) => put({ elevation_m: v ?? undefined })} />
          </div>
          <Field label="Nawierzchnia">
            <Chips label="Dyscyplina wydarzenia" options={opts(DISCIPLINES, DISCIPLINE_LABEL)} value={e.discipline} onChange={(v) => put({ discipline: v })} />
          </Field>
          <Field label="Co znaczy sukces?">
            <Chips label="Kryterium" options={[{ value: 'finish', label: 'Ukończyć' }, { value: 'time', label: 'Zmieścić się w czasie' }]} value={e.target_time_min ? 'time' : 'finish'} onChange={(v) => put({ target_time_min: v === 'time' ? (e.target_time_min ?? Math.round(((e.distance_km ?? 100) / 25) * 60 / 30) * 30) : null })} />
            {e.target_time_min != null && (
              <div className="m-list">
                <PickRow label="Docelowy czas" value={e.target_time_min} options={range(60, 1800, 30)} format={minutes} onChange={(v) => put({ target_time_min: v })} />
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
          <PickRow label="Docelowe FTP" value={f.target_w} options={range(120, 450, 5)} format={(v) => `${v} W`} onChange={(v) => put({ target_w: v ?? undefined })} />
          <DateRow label="Do kiedy" value={f.date} min={minDate} max={maxDate} optional onChange={(v) => put({ date: v })} />
        </div>
      )
      break
    }
    case 'speed': {
      const s = g as GoalOf<'speed'>
      body = (
        <>
          <div className="m-list">
            <PickRow label="Średnia prędkość" value={s.kmh} options={range(18, 40)} format={(v) => `${v} km/h`} onChange={(v) => put({ kmh: v ?? undefined })} />
            <DateRow label="Do kiedy" value={s.date} min={minDate} max={maxDate} optional onChange={(v) => put({ date: v })} />
          </div>
          <Field label="Przez ile godzin?">
            <Chips label="Czas jazdy" options={[1, 1.5, 2, 2.5, 3, 4, 5, 6].map((v) => ({ value: v, label: hours(v) }))} value={s.hours} onChange={(v) => put({ hours: v })} />
          </Field>
        </>
      )
      break
    }
    case 'weight': {
      const w = g as GoalOf<'weight'>
      body = (
        <div className="m-list">
          <PickRow label="Docelowa masa" value={w.target_kg} options={range(45, 140, 0.5)} format={(v) => `${String(v).replace('.', ',')} kg`} onChange={(v) => put({ target_kg: v ?? undefined })} />
          <DateRow label="Do kiedy" value={w.date} min={minDate} max={maxDate} onChange={(v) => put({ date: v ?? undefined })} />
        </div>
      )
      break
    }
    case 'fitness': {
      const f = g as GoalOf<'fitness'>
      body = (
        <>
          <div className="m-list">
            <PickRow label="Regularnie w tygodniu" value={f.weekly_hours} options={range(1, 20, 0.5)} format={hours} onChange={(v) => put({ weekly_hours: v ?? undefined })} />
          </div>
          <Field label="Przez ile tygodni?">
            <Chips label="Tygodnie" options={[4, 8, 12, 16, 24, 52].map((v) => ({ value: v, label: `${v} tyg.` }))} value={f.weeks} onChange={(v) => put({ weeks: v })} />
          </Field>
        </>
      )
      break
    }
    case 'comeback': {
      const c = g as GoalOf<'comeback'>
      body = (
        <>
          <Field label="Jak długa była przerwa?">
            <Chips label="Przerwa" options={[2, 4, 8, 12, 26, 52, 104].map((v) => ({ value: v, label: v >= 52 ? `${v / 52} ${v === 52 ? 'rok' : 'lata'}` : `${v} tyg.` }))} value={c.weeks_off} onChange={(v) => put({ weeks_off: v })} />
          </Field>
          <Field label="Powód">
            <Chips label="Powód przerwy" options={opts(['illness', 'injury', 'life', 'other'] as const, REASON_LABEL)} value={c.reason} onChange={(v) => put({ reason: v })} />
          </Field>
          <div className="m-list">
            <PickRow label="Chcę wrócić do" value={c.weekly_hours} options={range(1, 20, 0.5)} format={(v) => `${hours(v)}/tydz.`} onChange={(v) => put({ weekly_hours: v ?? undefined })} />
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
        <Notice key={c.id} tone={c.level === 'warn' ? 'orange' : 'blue'} title={c.level === 'warn' ? 'Uwaga' : 'Dobrze wiedzieć'}>
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
