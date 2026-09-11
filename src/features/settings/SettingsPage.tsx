import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useEngine } from '@/app/useSettings'
import type { Settings } from '@/engine/schema'
import { earliestTripStart, layoutWeeks, TripDateError } from '@/engine/layout'
import { isValidISODate } from '@/engine/dates'
import { Button, Card, CardTitle, PageTitle } from '@/components/ui'
import { fmtDate } from '@/lib/dates'
import { PHASE_SHORT } from '@/lib/labels'
import type { LayoutWeek, PhaseId } from '@/engine/types'

type Form = {
  athlete_name: string
  body_weight_start_kg: string
  body_weight_target_kg: string
  bike_and_kit_kg: string
  lthr_bpm: string
  hr_max_bpm: string
  ftp_w_estimate: string
  ftp_w_goal: string
  program_start: string
  trip_start: string
  gym_a: 'wed' | 'tue'
  volume_scale: string
}

function toForm(s: Settings): Form {
  return {
    athlete_name: s.athlete_name,
    body_weight_start_kg: String(s.body_weight_start_kg),
    body_weight_target_kg: String(s.body_weight_target_kg),
    bike_and_kit_kg: String(s.bike_and_kit_kg),
    lthr_bpm: s.lthr_bpm ? String(s.lthr_bpm) : '',
    hr_max_bpm: s.hr_max_bpm ? String(s.hr_max_bpm) : '',
    ftp_w_estimate: String(s.ftp_w_estimate),
    ftp_w_goal: String(s.ftp_w_goal),
    program_start: s.program_start,
    trip_start: s.trip_start,
    gym_a: s.gym_days.A,
    volume_scale: String(s.volume_scale),
  }
}

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function fromForm(f: Form, base: Settings): { settings: Settings; errors: string[] } {
  const errors: string[] = []
  const req = (label: string, v: string, min: number, max: number): number => {
    const n = num(v)
    if (n === null || n < min || n > max) {
      errors.push(`${label}: podaj liczbę ${min}–${max}.`)
      return NaN
    }
    return n
  }
  const opt = (label: string, v: string, min: number, max: number): number | null => {
    if (v.trim() === '') return null
    return req(label, v, min, max)
  }
  if (!isValidISODate(f.program_start)) errors.push('Start programu: nieprawidłowa data.')
  if (!isValidISODate(f.trip_start)) errors.push('Data wyjazdu: nieprawidłowa data.')
  const settings: Settings = {
    ...base,
    athlete_name: f.athlete_name.trim() || base.athlete_name,
    body_weight_start_kg: req('Masa startowa', f.body_weight_start_kg, 50, 200),
    body_weight_target_kg: req('Masa docelowa', f.body_weight_target_kg, 50, 200),
    bike_and_kit_kg: req('Rower + wyposażenie', f.bike_and_kit_kg, 5, 40),
    lthr_bpm: opt('LTHR', f.lthr_bpm, 100, 220),
    hr_max_bpm: opt('HRmax', f.hr_max_bpm, 120, 230),
    ftp_w_estimate: req('FTP', f.ftp_w_estimate, 50, 600),
    ftp_w_goal: req('Cel FTP', f.ftp_w_goal, 50, 600),
    program_start: f.program_start,
    trip_start: f.trip_start,
    gym_days: { A: f.gym_a, B: 'fri', C: f.gym_a },
    volume_scale: Math.round(req('Skala objętości', f.volume_scale, 0.7, 1) * 100) / 100,
  }
  return { settings, errors }
}

function phaseSpans(weeks: LayoutWeek[]) {
  const out: { id: PhaseId; from: string; to: string; count: number }[] = []
  for (const w of weeks) {
    const last = out.at(-1)
    if (last && last.id === w.phase) {
      last.count++
      last.to = w.monday
    } else out.push({ id: w.phase, from: w.monday, to: w.monday, count: 1 })
  }
  return out
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block py-1.5">
      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

const inputCls = 'mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-900'

export function SettingsPage() {
  const engine = useEngine()
  const [saved, setSaved] = useState(false)
  // klucz = zapisane ustawienia → po zapisie/resecie formularz startuje od nowa z aktualnych wartości
  return <SettingsForm key={JSON.stringify(engine.settingsApi.settings)} engine={engine} saved={saved} setSaved={setSaved} />
}

function SettingsForm({ engine, saved, setSaved }: { engine: ReturnType<typeof useEngine>; saved: boolean; setSaved: (v: boolean) => void }) {
  const { settings, update, reset } = engine.settingsApi
  const [form, setForm] = useState<Form>(() => toForm(settings))

  const parsed = useMemo(() => fromForm(form, settings), [form, settings])
  const preview = useMemo(() => {
    if (parsed.errors.length) return null
    if (parsed.settings.trip_start === settings.trip_start && parsed.settings.program_start === settings.program_start) return null
    try {
      const next = layoutWeeks(engine.ctx.program, parsed.settings)
      return { ok: true as const, before: phaseSpans(engine.weeks), after: phaseSpans(next), total: next.length }
    } catch (e) {
      return { ok: false as const, message: e instanceof TripDateError ? `${e.message} Najwcześniej: ${fmtDate(e.earliest)}.` : String(e) }
    }
  }, [parsed, settings, engine])

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const canSave = parsed.errors.length === 0 && !(preview && !preview.ok)

  async function save() {
    if (!canSave) return
    await update(parsed.settings)
    setSaved(true)
  }

  return (
    <div className="space-y-3">
      <PageTitle sub="Zapisywane lokalnie na tym urządzeniu (synchronizacja w Etapie 2)">Ustawienia</PageTitle>
      <Card>
        <CardTitle icon="👤">Profil</CardTitle>
        <Field label="Imię">
          <input className={inputCls} value={form.athlete_name} onChange={set('athlete_name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Masa startowa (kg)">
            <input className={inputCls} inputMode="decimal" value={form.body_weight_start_kg} onChange={set('body_weight_start_kg')} />
          </Field>
          <Field label="Masa docelowa (kg)">
            <input className={inputCls} inputMode="decimal" value={form.body_weight_target_kg} onChange={set('body_weight_target_kg')} />
          </Field>
          <Field label="LTHR (bpm)" hint="z testu progowego">
            <input className={inputCls} inputMode="numeric" placeholder="np. 160" value={form.lthr_bpm} onChange={set('lthr_bpm')} />
          </Field>
          <Field label="HRmax (bpm)" hint="opcjonalnie">
            <input className={inputCls} inputMode="numeric" value={form.hr_max_bpm} onChange={set('hr_max_bpm')} />
          </Field>
          <Field label="FTP szacunek (W)">
            <input className={inputCls} inputMode="numeric" value={form.ftp_w_estimate} onChange={set('ftp_w_estimate')} />
          </Field>
          <Field label="Cel FTP (W)">
            <input className={inputCls} inputMode="numeric" value={form.ftp_w_goal} onChange={set('ftp_w_goal')} />
          </Field>
          <Field label="Rower + bagaż (kg)" hint="do kalkulatora podjazdu">
            <input className={inputCls} inputMode="decimal" value={form.bike_and_kit_kg} onChange={set('bike_and_kit_kg')} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardTitle icon="📆">Daty</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start programu" hint="poniedziałek tygodnia 1">
            <input className={inputCls} type="date" value={form.program_start} onChange={set('program_start')} />
          </Field>
          <Field label="Data wyjazdu">
            <input className={inputCls} type="date" value={form.trip_start} onChange={set('trip_start')} min={earliestTripStart(form.program_start || settings.program_start)} />
          </Field>
        </div>
        {preview && !preview.ok && <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{preview.message}</p>}
        {preview && preview.ok && (
          <div className="mt-2 rounded-lg bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
            <p className="mb-1 font-semibold">Podgląd zmian (R14): {preview.total} tygodni</p>
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left">Faza</th>
                  <th className="text-left">Teraz</th>
                  <th className="text-left">Po zmianie</th>
                </tr>
              </thead>
              <tbody>
                {preview.after.map((p, i) => {
                  const b = preview.before[i]
                  const changed = !b || b.count !== p.count || b.from !== p.from
                  return (
                    <tr key={p.id} className={changed ? 'font-semibold' : ''}>
                      <td className="py-0.5">{PHASE_SHORT[p.id]}</td>
                      <td className="py-0.5">{b ? `${b.count} tyg. od ${fmtDate(b.from)}` : '—'}</td>
                      <td className="py-0.5">{`${p.count} tyg. od ${fmtDate(p.from)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle icon="🏋️">Siłownia i objętość</CardTitle>
        <Field label="Dni siłowni">
          <select className={inputCls} value={form.gym_a} onChange={set('gym_a')}>
            <option value="wed">środa (A/C) + piątek (B)</option>
            <option value="tue">wtorek (A/C) + piątek (B)</option>
          </select>
        </Field>
        <Field label={`Skala objętości (R16): ${Number(form.volume_scale).toLocaleString('pl-PL')}`} hint="0,7–1,0 – skraca Z2, długie jazdy i pagórki; akcenty, testy i góry bez zmian">
          <input className="mt-1 w-full" type="range" min={0.7} max={1} step={0.05} value={form.volume_scale} onChange={set('volume_scale')} />
        </Field>
      </Card>
      {parsed.errors.length > 0 && (
        <ul className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button onClick={save} disabled={!canSave} className="flex-1">
          {saved ? 'Zapisano ✓' : 'Zapisz'}
        </Button>
        <Button variant="secondary" onClick={() => reset()}>
          Przywróć domyślne
        </Button>
      </div>
      <p className="text-xs text-slate-400">Wersja programu {engine.ctx.program.version}. Integracje (Strava, Wahoo) i eksport kopii pojawią się w kolejnych etapach.</p>
    </div>
  )
}
