import { useMemo, useState, type ChangeEvent } from 'react'
import { useEngine } from '@/app/useSettings'
import type { Settings } from '@/engine/schema'
import { earliestTripStart, layoutWeeks, TripDateError } from '@/engine/layout'
import { isValidISODate } from '@/engine/dates'
import { Actions, Button, Card, CardSection, CardTitle, Checkbox, Field, Input, Inset, PageTitle, Segmented, Select } from '@/components/ui'
import { fmtDate } from '@/lib/dates'
import { PHASE_SHORT } from '@/lib/labels'
import type { LayoutWeek, PhaseId } from '@/engine/types'
import { AccountSection, BackupSection } from './AccountSection'
import { useToast } from '@/components/Toast'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { IntegrationsSection } from './IntegrationsSection'
import { PushSection } from './PushSection'
import { WeatherSettings } from './WeatherSettings'

type Form = {
  athlete_name: string
  body_weight_start_kg: string
  body_weight_target_kg: string
  bike_and_kit_kg: string
  lthr_bpm: string
  hr_max_bpm: string
  ftp_w_estimate: string
  ftp_w_goal: string
  power_meter: boolean
  program_start: string
  trip_start: string
  gym_a: 'wed' | 'tue'
  volume_scale: string
}

type FieldErrors = Partial<Record<keyof Form, string>>

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
    power_meter: s.power_meter,
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

/** Walidacja: błędy przypisane do pól (wyświetlane pod polem). */
function fromForm(f: Form, base: Settings): { settings: Settings; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const req = (key: keyof Form, v: string, min: number, max: number): number => {
    const n = num(v)
    if (n === null || n < min || n > max) {
      errors[key] = `Podaj liczbę ${min}–${max}.`
      return NaN
    }
    return n
  }
  const opt = (key: keyof Form, v: string, min: number, max: number): number | null => {
    if (v.trim() === '') return null
    return req(key, v, min, max)
  }
  if (!isValidISODate(f.program_start)) errors.program_start = 'Nieprawidłowa data.'
  if (!isValidISODate(f.trip_start)) errors.trip_start = 'Nieprawidłowa data.'
  const settings: Settings = {
    ...base,
    athlete_name: f.athlete_name.trim() || base.athlete_name,
    body_weight_start_kg: req('body_weight_start_kg', f.body_weight_start_kg, 50, 200),
    body_weight_target_kg: req('body_weight_target_kg', f.body_weight_target_kg, 50, 200),
    bike_and_kit_kg: req('bike_and_kit_kg', f.bike_and_kit_kg, 5, 40),
    lthr_bpm: opt('lthr_bpm', f.lthr_bpm, 100, 220),
    hr_max_bpm: opt('hr_max_bpm', f.hr_max_bpm, 120, 230),
    ftp_w_estimate: req('ftp_w_estimate', f.ftp_w_estimate, 50, 600),
    ftp_w_goal: req('ftp_w_goal', f.ftp_w_goal, 50, 600),
    power_meter: f.power_meter,
    program_start: f.program_start,
    trip_start: f.trip_start,
    gym_days: { A: f.gym_a, B: 'fri', C: f.gym_a },
    volume_scale: Math.round(req('volume_scale', f.volume_scale, 0.7, 1) * 100) / 100,
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

export function SettingsPage() {
  const engine = useEngine()
  const [saved, setSaved] = useState(false)
  // klucz = zapisane ustawienia → po zapisie/resecie formularz startuje od nowa z aktualnych wartości
  return <SettingsForm key={JSON.stringify(engine.settingsApi.settings)} engine={engine} saved={saved} setSaved={setSaved} />
}

function SettingsForm({ engine, saved, setSaved }: { engine: ReturnType<typeof useEngine>; saved: boolean; setSaved: (v: boolean) => void }) {
  const { settings, update, reset } = engine.settingsApi
  const toast = useToast()
  const [form, setForm] = useState<Form>(() => toForm(settings))

  const parsed = useMemo(() => fromForm(form, settings), [form, settings])
  const errorCount = Object.keys(parsed.errors).length
  const preview = useMemo(() => {
    if (errorCount) return null
    if (parsed.settings.trip_start === settings.trip_start && parsed.settings.program_start === settings.program_start) return null
    try {
      const next = layoutWeeks(engine.ctx.program, parsed.settings)
      return { ok: true as const, before: phaseSpans(engine.weeks), after: phaseSpans(next), total: next.length }
    } catch (e) {
      return { ok: false as const, message: e instanceof TripDateError ? `${e.message} Najwcześniej: ${fmtDate(e.earliest)}.` : String(e) }
    }
  }, [parsed, errorCount, settings, engine])

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }
  const err = (k: keyof Form) => parsed.errors[k] ?? null
  const numField = (k: keyof Form, label: string, mode: 'numeric' | 'decimal', hint?: string, placeholder?: string) => (
    <Field label={label} hint={hint} error={err(k)}>
      <Input inputMode={mode} value={form[k] as string} onChange={set(k)} invalid={!!err(k)} placeholder={placeholder} />
    </Field>
  )

  const canSave = errorCount === 0 && !(preview && !preview.ok)

  async function save() {
    if (!canSave) return
    await toast.run('Zapisuję ustawienia…', () => update(parsed.settings), () => 'Ustawienia zapisane')
    setSaved(true)
  }

  return (
    <div className="space-y-3">
      <PageTitle sub="Profil, daty, siłownia, konto">Ustawienia</PageTitle>
      {/* dwie niezależne kolumny (a nie wiersze siatki) – bez pustych dziur, gdy karty mają różną wysokość; na komputerze profil po lewej */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-3 lg:space-y-4">
          <AccountSection />
          <IntegrationsSection />
          <PushSection />
        </div>
        <div className="min-w-0 space-y-3 lg:order-first lg:space-y-4">
          <Card>
            <CardTitle icon="👤">Profil</CardTitle>
            <div className="space-y-3">
              <Field label="Imię">
                <Input value={form.athlete_name} onChange={set('athlete_name')} autoComplete="given-name" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                {numField('body_weight_start_kg', 'Masa startowa (kg)', 'decimal')}
                {numField('body_weight_target_kg', 'Masa docelowa (kg)', 'decimal')}
                {numField('lthr_bpm', 'LTHR (bpm)', 'numeric', engine.ctx.tests?.length ? `ręcznie; testy mają pierwszeństwo (ostatni: ${engine.ctx.tests.at(-1)!.lthr_bpm} bpm)` : 'ręcznie – albo zapisz wynik testu', 'np. 160')}
                {numField('hr_max_bpm', 'HRmax (bpm)', 'numeric', 'opcjonalnie')}
                {numField('ftp_w_estimate', 'FTP szacunek (W)', 'numeric')}
                {numField('ftp_w_goal', 'Cel FTP (W)', 'numeric')}
                {numField('bike_and_kit_kg', 'Rower + bagaż (kg)', 'decimal', 'do kalkulatora podjazdu')}
              </div>
            </div>
            <CardSection>
              <Checkbox
                label="Mam miernik mocy"
                hint="Cele w watach na ekranie Dziś i w planach na Wahoo (ELEMNT liczy TSS, IF i rysuje profil tylko z mocy). FTP z pola wyżej albo z ostatniego testu."
                checked={form.power_meter}
                onChange={(e) => {
                  setSaved(false)
                  setForm((f) => ({ ...f, power_meter: e.target.checked }))
                }}
              />
            </CardSection>
          </Card>
          <Card>
            <CardTitle icon="📆">Daty</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start programu" hint="poniedziałek tygodnia 1" error={err('program_start')}>
                <Input type="date" value={form.program_start} onChange={set('program_start')} invalid={!!err('program_start')} />
              </Field>
              <Field label="Data wyjazdu" error={err('trip_start') ?? (preview && !preview.ok ? preview.message : null)}>
                <Input type="date" value={form.trip_start} onChange={set('trip_start')} min={earliestTripStart(form.program_start || settings.program_start)} invalid={!!err('trip_start') || !!(preview && !preview.ok)} />
              </Field>
            </div>
            {preview && preview.ok && (
              <Inset tone="info" className="mt-3">
                <p className="mb-1 font-semibold">Podgląd zmian (R14): {preview.total} tygodni</p>
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-medium">Faza</th>
                      <th className="text-left font-medium">Teraz</th>
                      <th className="text-left font-medium">Po zmianie</th>
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
              </Inset>
            )}
          </Card>
          <Card>
            <CardTitle icon="🌗">Wygląd</CardTitle>
            <ThemePicker />
          </Card>
          <WeatherSettings />
          <Card>
            <CardTitle icon="🏋️">Siłownia i objętość</CardTitle>
            <div className="space-y-3">
              <Field label="Dni siłowni">
                <Select value={form.gym_a} onChange={set('gym_a')}>
                  <option value="wed">środa (A/C) + piątek (B)</option>
                  <option value="tue">wtorek (A/C) + piątek (B)</option>
                </Select>
              </Field>
              <Field label={`Skala objętości (R16): ${Number(form.volume_scale).toLocaleString('pl-PL')}`} hint="0,7–1,0 – skraca Z2, długie jazdy i pagórki; akcenty, testy i góry bez zmian" error={err('volume_scale')}>
                <input className="block min-h-11 w-full accent-sky-600" type="range" min={0.7} max={1} step={0.05} value={form.volume_scale} onChange={set('volume_scale')} />
              </Field>
            </div>
          </Card>
          {errorCount > 0 && (
            <Inset tone="error" role="alert">
              Popraw {errorCount === 1 ? 'zaznaczone pole' : 'zaznaczone pola'} – zapis jest zablokowany.
            </Inset>
          )}
          <Actions>
            <Button onClick={save} disabled={!canSave} className="flex-1">
              {saved ? 'Zapisano ✓' : 'Zapisz'}
            </Button>
            <Button variant="secondary" onClick={() => toast.run('Przywracam domyślne…', reset, () => 'Przywrócono ustawienia domyślne')}>
              Przywróć domyślne
            </Button>
          </Actions>
          <BackupSection />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Wersja programu {engine.ctx.program.version} · build {__BUILD_ID__}
          </p>
        </div>
      </div>
    </div>
  )
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Jak system' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
]

function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>(() => getThemePref())
  return (
    <div>
      <Segmented
        role="radiogroup"
        label="Motyw"
        value={pref}
        options={THEME_OPTIONS}
        onChange={(t) => {
          setThemePref(t)
          setPref(t)
        }}
      />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Zapisane na tym urządzeniu. „Jak system” podąża za ustawieniem telefonu lub komputera.</p>
    </div>
  )
}
