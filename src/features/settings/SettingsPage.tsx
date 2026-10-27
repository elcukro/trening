import { useMemo, useState, type ChangeEvent } from 'react'
import { useEngine, useSettings } from '@/app/useSettings'
import type { Settings } from '@/engine/schema'
import { earliestTripStart, layoutWeeks, TripDateError } from '@/engine/layout'
import { isValidISODate } from '@/engine/dates'
import { Actions, Button, Card, CardSection, CardTitle, Checkbox, Field, Input, Inset, PageTitle, Row, Segmented, Select } from '@/components/ui'
import { DEFAULT_PROGRAM_ID, programOptions } from '@/data/program'
import { fmtDate } from '@/lib/dates'
import { PHASE_SHORT } from '@/lib/labels'
import type { LayoutWeek, PhaseId } from '@/engine/types'
import { AccountSection, BackupSection } from './AccountSection'
import { useToast } from '@/components/Toast'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { IntegrationsSection } from './IntegrationsSection'
import { PushSection } from './PushSection'
import { EmailSection } from './EmailSection'
import { WeatherSettings } from './WeatherSettings'
import { languagePatch, t as tr } from '@/i18n'
import { systemLang } from '@/i18n/core'
import { useT } from '@/i18n/react'
import { num as fmtNum } from '@/lib/format'

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
  volume_scale: string
  height_cm: string
  birth_date: string
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
    volume_scale: String(s.volume_scale),
    height_cm: s.height_cm != null ? String(s.height_cm) : '',
    birth_date: s.birth_date ?? (s.birth_year != null ? `${s.birth_year}-01-01` : ''),
  }
}

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const intOrNull = (n: number | null): number | null => (n == null || Number.isNaN(n) ? null : Math.round(n))

/** Walidacja: błędy przypisane do pól (wyświetlane pod polem). */
function fromForm(f: Form, base: Settings): { settings: Settings; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const tv = tr().settings.validation
  const req = (key: keyof Form, v: string, min: number, max: number): number => {
    const n = num(v)
    if (n === null || n < min || n > max) {
      errors[key] = tv.number(fmtNum(min, 2), fmtNum(max, 2))
      return NaN
    }
    return n
  }
  const opt = (key: keyof Form, v: string, min: number, max: number): number | null => {
    if (v.trim() === '') return null
    return req(key, v, min, max)
  }
  if (!isValidISODate(f.program_start)) errors.program_start = tv.date
  if (!isValidISODate(f.trip_start)) errors.trip_start = tv.date
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
    volume_scale: Math.round(req('volume_scale', f.volume_scale, 0.7, 1) * 100) / 100,
    height_cm: intOrNull(opt('height_cm', f.height_cm, 120, 230)),
    birth_date: f.birth_date && isValidISODate(f.birth_date) && f.birth_date >= '1920-01-01' && f.birth_date <= '2015-12-31' ? f.birth_date : null,
    birth_year: f.birth_date && isValidISODate(f.birth_date) && f.birth_date >= '1920-01-01' && f.birth_date <= '2015-12-31' ? Number(f.birth_date.slice(0, 4)) : null,
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
  const t = useT()
  const ts = t.settings
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
      return { ok: false as const, message: e instanceof TripDateError ? ts.validation.earliest(e.message, fmtDate(e.earliest)) : String(e) }
    }
  }, [parsed, errorCount, settings, engine, ts])

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
    await toast.run(ts.page.saving, () => update(parsed.settings), () => ts.page.saved)
    setSaved(true)
  }

  return (
    <div className="space-y-3">
      <PageTitle sub={ts.page.sub}>{ts.page.title}</PageTitle>
      {/* dwie niezależne kolumny (a nie wiersze siatki) – bez pustych dziur, gdy karty mają różną wysokość; na komputerze profil po lewej */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-3 lg:space-y-4">
          <AccountSection />
          <IntegrationsSection />
          <PushSection />
          <EmailSection />
        </div>
        <div className="min-w-0 space-y-3 lg:order-first lg:space-y-4">
          <ProgramCard />
          <Card>
            <CardTitle icon="👤">{ts.profile.title}</CardTitle>
            <div className="space-y-3">
              <Field label={ts.profile.name}>
                <Input value={form.athlete_name} onChange={set('athlete_name')} autoComplete="given-name" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                {numField('body_weight_start_kg', ts.profile.weightStart, 'decimal')}
                {numField('body_weight_target_kg', ts.profile.weightTarget, 'decimal')}
                {numField('lthr_bpm', ts.profile.lthr, 'numeric', engine.ctx.tests?.length ? ts.profile.lthrHintTests(engine.ctx.tests.at(-1)!.lthr_bpm ?? null) : ts.profile.lthrHint, ts.profile.lthrPlaceholder)}
                {numField('hr_max_bpm', ts.profile.hrMax, 'numeric', ts.profile.optional)}
                {numField('ftp_w_estimate', ts.profile.ftpEstimate, 'numeric')}
                {numField('ftp_w_goal', ts.profile.ftpGoal, 'numeric')}
                {numField('bike_and_kit_kg', ts.profile.bikeKit, 'decimal', ts.profile.bikeKitHint)}
                {numField('height_cm', ts.profile.height, 'numeric', ts.profile.forKcal)}
                <Field label={ts.profile.birthDate} hint={ts.profile.forKcal}>
                  <Input type="date" min="1920-01-01" max="2015-12-31" value={form.birth_date} onChange={set('birth_date')} />
                </Field>
              </div>
            </div>
            <CardSection>
              <Checkbox
                label={ts.profile.powerMeter}
                hint={ts.profile.powerMeterHint}
                checked={form.power_meter}
                onChange={(e) => {
                  setSaved(false)
                  setForm((f) => ({ ...f, power_meter: e.target.checked }))
                }}
              />
            </CardSection>
          </Card>
          <Card>
            <CardTitle icon="📆">{ts.dates.title}</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label={ts.dates.programStart} hint={ts.dates.programStartHint} error={err('program_start')}>
                <Input type="date" value={form.program_start} onChange={set('program_start')} invalid={!!err('program_start')} />
              </Field>
              <Field label={engine.ctx.program.meta.target.label} error={err('trip_start') ?? (preview && !preview.ok ? preview.message : null)}>
                <Input type="date" value={form.trip_start} onChange={set('trip_start')} min={earliestTripStart(form.program_start || settings.program_start)} invalid={!!err('trip_start') || !!(preview && !preview.ok)} />
              </Field>
            </div>
            {preview && preview.ok && (
              <Inset tone="info" className="mt-3">
                <p className="mb-1 font-semibold">{ts.dates.previewTitle(preview.total)}</p>
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-medium">{ts.dates.phase}</th>
                      <th className="text-left font-medium">{ts.dates.now}</th>
                      <th className="text-left font-medium">{ts.dates.after}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.after.map((p, i) => {
                      const b = preview.before[i]
                      const changed = !b || b.count !== p.count || b.from !== p.from
                      return (
                        <tr key={p.id} className={changed ? 'font-semibold' : ''}>
                          <td className="py-0.5">{PHASE_SHORT[p.id]}</td>
                          <td className="py-0.5">{b ? ts.dates.span(b.count, fmtDate(b.from)) : '—'}</td>
                          <td className="py-0.5">{ts.dates.span(p.count, fmtDate(p.from))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Inset>
            )}
          </Card>
          <Card>
            <CardTitle icon="🌗">{ts.appearance.title}</CardTitle>
            <ThemePicker />
          </Card>
          <LanguageCard />
          <WeatherSettings />
          <Card>
            <CardTitle icon="📏">{ts.volume.title}</CardTitle>
            <div className="space-y-3">
              <Field label={ts.volume.scale(fmtNum(Number(form.volume_scale), 2))} hint={ts.volume.hint} error={err('volume_scale')}>
                <input className="block min-h-11 w-full accent-sky-600" type="range" min={0.7} max={1} step={0.05} value={form.volume_scale} onChange={set('volume_scale')} />
              </Field>
            </div>
          </Card>
          {errorCount > 0 && (
            <Inset tone="error" role="alert">
              {ts.page.fixErrors(errorCount)}
            </Inset>
          )}
          <Actions>
            <Button onClick={save} disabled={!canSave} className="flex-1">
              {saved ? ts.page.savedCheck : t.common.save}
            </Button>
            <Button variant="secondary" onClick={() => toast.run(ts.page.resetting, reset, () => ts.page.resetDone)}>
              {ts.page.resetDefaults}
            </Button>
          </Actions>
          <BackupSection />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {ts.page.version(engine.ctx.program.version, __BUILD_ID__)}
          </p>
        </div>
      </div>
    </div>
  )
}

function ThemePicker() {
  const ta = useT().settings.appearance
  const [pref, setPref] = useState<ThemePref>(() => getThemePref())
  const options: { value: ThemePref; label: string }[] = [
    { value: 'system', label: ta.system },
    { value: 'light', label: ta.light },
    { value: 'dark', label: ta.dark },
  ]
  return (
    <div>
      <Segmented
        role="radiogroup"
        label={ta.theme}
        value={pref}
        options={options}
        onChange={(t) => {
          setThemePref(t)
          setPref(t)
        }}
      />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{ta.hint}</p>
    </div>
  )
}

/** Język aplikacji (docs/34 § 4): zapis w profilu (`settings.language`), `LangProvider` w App.tsx przełącza drzewo. */
function LanguageCard() {
  const tl = useT().common.language
  const { settings, update } = useSettings()
  const choice = settings.language === 'pl' || settings.language === 'en' ? settings.language : 'system'
  const detected = systemLang() === 'pl' ? tl.pl : tl.en
  return (
    <Card>
      <CardTitle icon="🌐">{tl.title}</CardTitle>
      <Select aria-label={tl.title} value={choice} onChange={(e) => void update(languagePatch(e.target.value))}>
        <option value="system">{tl.system(detected)}</option>
        <option value="pl">{tl.pl}</option>
        <option value="en">{tl.en}</option>
      </Select>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tl.hint}</p>
    </Card>
  )
}

/**
 * Wybór programu treningowego. Zmiana przelicza cały kalendarz, więc daty i progi
 * z poprzedniego programu zostają – trzeba je sprawdzić po przełączeniu.
 */
function ProgramCard() {
  const engine = useEngine()
  const toast = useToast()
  const tp = useT().settings.program
  const { program, settings } = engine.ctx
  const current = settings.program_id ?? DEFAULT_PROGRAM_ID
  return (
    <Card>
      <CardTitle icon="🗺️">{tp.title}</CardTitle>
      <Field label={tp.label} hint={tp.hint}>
        <Select
          value={current}
          onChange={(e) => void toast.run(tp.switching, () => engine.settingsApi.update({ program_id: e.target.value }), () => tp.switched)}
        >
          {current === 'generated' && <option value="generated">{tp.generated(program.meta.name)}</option>}
          {programOptions().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <CardSection className="divide-y divide-slate-200/70 dark:divide-slate-700/80">
        <Row label={tp.version}>{program.version}</Row>
        <Row label={tp.weeks}>{Object.keys(program.weeks).length}</Row>
        <Row label={tp.phases}>{program.phases.length}</Row>
      </CardSection>
    </Card>
  )
}
