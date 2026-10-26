import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, type OnboardingRow } from '@/db'
import { completeOnboarding, saveOnboardingDraft, softDelete } from '@/db/repo'
import { useEngine } from '@/app/useSettings'
import { useToast } from '@/components/Toast'
import { ONBOARDING_ID, SKIPPABLE, STEPS, checks, finalize, firstIncomplete, healthScreen, nextStep, prevStep, stepNumber, stepValid, type AthleteProfile, type Draft, type Step } from '@/engine/onboarding'
import type { Settings } from '@/engine/schema'
import { todayISO } from '@/lib/dates'
import { minutes as fmtMinutes, num } from '@/lib/format'
import { planPreview } from '@/day/planPreview'
import { IconChevronLeft } from '@/ios/components/Icons'
import { confirmAction, haptic } from '@/native'
import { startFrom, type StartStep } from '@/day/onboarding'
import { ONBOARDING_LATER } from '@/day/useOnboarding'
import { ART } from '../art'
import { useEdgeBack } from '../useEdgeBack'
import { Btn } from '../components/Chrome'
import { Notice, STEP_BODY, STEP_HEAD, type StepProps } from './steps'
import { DAY_SHORT, STEP_TITLE, stepSummary } from './labels'

type View = StartStep | 'done'

/** „Później” – onboarding nie wraca sam do końca sesji (dokończysz z Ja). */
function later() {
  try {
    sessionStorage.setItem(ONBOARDING_LATER, '1')
  } catch {
    /* prywatne okno */
  }
}

/**
 * Onboarding (docs/31): jedno pytanie albo jedna grupa na ekran, pasek „krok n z N”, wstecz (przycisk i gest od
 * krawędzi), pomijanie pól opcjonalnych, szkic zapisywany po każdym kroku i podsumowanie z poprawkami.
 * Dane ładują się raz (Dexie) – potem ekran trzyma szkic w stanie, żeby synchronizacja nie podmieniała go w trakcie.
 */
/** Ten sam onboarding w `/m` (telefon, aplikacja iOS) i jako karta na komputerze (`/start`) – różnią się tylko adresy wyjścia. */
export function OnboardingScreen({ home = '/m', me = '/m/ja' }: { home?: string; me?: string }) {
  const engine = useEngine()
  const row = useLiveQuery(() => db.onboarding.get(ONBOARDING_ID).then((r) => r ?? null), [], undefined)
  if (row === undefined || !engine.settingsApi.loaded) return <div className="ob" />
  return <Flow row={row} settings={engine.ctx.settings} home={home} me={me} />
}

function Flow({ row, settings, home, me }: { row: OnboardingRow | null; settings: Partial<Settings>; home: string; me: string }) {
  const navigate = useNavigate()
  const engine = useEngine()
  const toast = useToast()
  const today = todayISO()
  const [start] = useState(() => startFrom(row, settings))
  const editing = row?.status === 'done' && !row.deleted_at
  const [draft, setDraft] = useState<Draft>(start.draft)
  const [view, setView] = useState<View>(start.step)
  // poprawka z podsumowania wraca do podsumowania, nie przechodzi przez resztę kroków
  const [fromSummary, setFromSummary] = useState(start.step === 'summary')
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [busy, setBusy] = useState(false)
  // profil po `finalize` – z niego ekran „Gotowe!” liczy podgląd pierwszego tygodnia planu
  const [saved, setSaved] = useState<AthleteProfile | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const go = (v: View, d: 'fwd' | 'back') => {
    setDir(d)
    setView(v)
  }
  /** Szkic na serwer i do Dexie – tylko w trakcie pierwszego wypełniania; poprawki skończonego zapisuje „Zapisz”. */
  const persist = (d: Draft, step: string) => {
    if (!editing) void saveOnboardingDraft(d, step)
  }
  const exit = () => {
    if (view !== 'done') later()
    navigate(home, { replace: true })
  }

  const back = (() => {
    if (view === 'intro' || view === 'done') return null
    if (view === 'summary') return editing ? exit : () => go(prevStep('summary')!, 'back')
    if (fromSummary) return () => go('summary', 'back')
    const p = prevStep(view)
    return () => go(p ?? 'intro', 'back')
  })()
  useEdgeBack(root, back)

  function next(step: Step) {
    const to = fromSummary ? 'summary' : nextStep(step)
    persist(draft, to)
    go(to, 'fwd')
  }

  async function save() {
    const r = finalize(draft)
    if (!r.ok) {
      haptic.error()
      toast.notify('Brakuje odpowiedzi – uzupełnij zaznaczony krok', 'error', r.issues.join(', '))
      const missing = firstIncomplete(draft)
      if (missing !== 'summary') go(missing, 'back')
      return
    }
    setBusy(true)
    try {
      await completeOnboarding(r.profile)
      // wzrost i data urodzenia są też polami profilu (budżet kcal, docs/25) – tylko gdy się zmieniły
      const patch: Partial<Settings> = {}
      if (r.profile.body.height_cm != null && r.profile.body.height_cm !== settings.height_cm) patch.height_cm = r.profile.body.height_cm
      if (r.profile.body.birth_date && r.profile.body.birth_date !== settings.birth_date) patch.birth_date = r.profile.body.birth_date
      if (Object.keys(patch).length) await engine.settingsApi.update(patch)
      haptic.success()
      if (editing) {
        toast.notify('Zapisano zmiany')
        navigate(me, { replace: true })
      } else {
        setSaved(r.profile)
        go('done', 'fwd')
      }
    } catch (e) {
      toast.notify('Nie udało się zapisać', 'error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!(await confirmAction({ title: 'Usunąć odpowiedzi?', message: 'Usuniemy Twoje odpowiedzi i zgodę na dane o zdrowiu. Plan nie będzie ich uwzględniał.', action: 'Usuń' }))) return
    await softDelete('onboarding', ONBOARDING_ID)
    later()
    toast.notify('Usunięto odpowiedzi')
    navigate(me, { replace: true })
  }

  const step = (STEPS as readonly string[]).includes(view) ? (view as Step) : null
  const valid = step ? stepValid(step, draft) : true
  const skippable = step && SKIPPABLE.includes(step)

  return (
    <div ref={root} className="ob">
      <header className="ob-head">
        <div className="ob-head-row">
          {back ? (
            <button className="m-nav-btn" onClick={back} aria-label="Wróć">
              <IconChevronLeft size={22} />
            </button>
          ) : (
            <span className="w-11" />
          )}
          <span className="m-foot m-dim flex-1 text-center" aria-live="polite">
            {step ? `Krok ${stepNumber(step)} z ${STEPS.length}` : view === 'summary' ? 'Podsumowanie' : ''}
          </span>
          {view !== 'done' ? (
            <button className="ob-later m-hit" onClick={exit}>
              {editing ? 'Zamknij' : 'Później'}
            </button>
          ) : (
            <span className="w-11" />
          )}
        </div>
        {view !== 'intro' && view !== 'done' && (
          <div className="ob-progress" role="progressbar" aria-label="Postęp" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step ? stepNumber(step) - 1 : STEPS.length}>
            {STEPS.map((s, i) => (
              <span key={s} data-done={step ? i < stepNumber(step) - 1 : true} data-now={s === step} />
            ))}
          </div>
        )}
      </header>

      {/* nowy kontener na każdy krok – zaczyna od góry i od animacji wejścia */}
      <div key={view} className="m-scroll">
        <div className="ob-body" data-dir={dir}>
          {view === 'intro' && <Intro legacy={row?.status === 'legacy'} />}
          {step && (
            <>
              <StepHead step={step} />
              <StepBody step={step} d={draft} set={setDraft} update={setDraft} today={today} />
            </>
          )}
          {view === 'summary' && <Summary draft={draft} today={today} editing={editing} onEdit={(s) => {
                setFromSummary(true)
                go(s, 'fwd')
              }} onRemove={editing ? () => void remove() : undefined} />}
          {view === 'done' && <Done draft={draft} profile={saved} today={today} />}
        </div>
      </div>

      <footer className="ob-foot">
        {view === 'intro' && (
          <Btn className="w-full" onClick={() => {
              const to = firstIncomplete(draft)
              setFromSummary(false)
              persist(draft, to === 'summary' ? 'summary' : to)
              go(to === 'summary' ? 'summary' : 'time', 'fwd')
            }}>
            Zaczynamy
          </Btn>
        )}
        {step && (
          <>
            <Btn className="w-full" disabled={!valid} onClick={() => next(step)}>
              {fromSummary ? 'Gotowe' : 'Dalej'}
            </Btn>
            {skippable && !fromSummary && (
              <button className="ob-skip m-hit" onClick={() => {
                  const d = { ...draft, body: undefined }
                  setDraft(d)
                  persist(d, nextStep(step))
                  go(nextStep(step), 'fwd')
                }}>
                Pomiń
              </button>
            )}
          </>
        )}
        {view === 'summary' && (
          <Btn className="w-full" disabled={busy} onClick={() => void save()}>
            {editing ? 'Zapisz zmiany' : 'Zapisz'}
          </Btn>
        )}
        {view === 'done' && (
          <Btn className="w-full" onClick={exit}>
            Do aplikacji
          </Btn>
        )}
      </footer>
    </div>
  )
}

/** Krok jako komponent (nie wywołanie funkcji) – kroki mają własne hooki (np. odczyt Zdrowia w „Ciele”). */
function StepBody({ step, ...props }: StepProps & { step: Step }) {
  const Body = STEP_BODY[step]
  return <Body {...props} />
}

function StepHead({ step }: { step: Step }) {
  const h = STEP_HEAD[step]
  return (
    <div className="ob-hero">
      <img src={h.art} alt="" width={112} height={112} />
      <h1 className="m-title">{h.title}</h1>
      <p className="m-sub m-dim">{h.sub}</p>
    </div>
  )
}

function Intro({ legacy }: { legacy: boolean }) {
  return (
    <>
      <div className="ob-hero">
        <img src={ART.coachWave} alt="" width={150} height={200} className="ob-coach" />
        <h1 className="m-display">{legacy ? 'Twoje potrzeby' : 'Ułóżmy plan pod Ciebie'}</h1>
        <p className="m-sub m-dim">Dziesięć krótkich kroków, ok. 3 minuty. Odpowiadasz dotknięciami – klawiatura prawie się nie pojawi. Możesz przerwać i wrócić później.</p>
      </div>
      <div className="m-list">
        {[
          ['/m/art/ob-time.png', 'Czas i obecna forma', 'ile możesz jeździć i od czego zaczynamy'],
          ['/m/art/ob-gear.png', 'Pomiar i sprzęt', 'waty, tętno albo odczucie; rowery i urządzenia'],
          ['/m/art/ob-health.png', 'Ciało i zdrowie', 'za Twoją zgodą, do bezpiecznego obciążenia'],
          ['/m/art/ob-goal.png', 'Cel', 'z liczbą i datą, żeby było widać postęp'],
        ].map(([art, title, sub]) => (
          <div key={title} className="m-row">
            <img src={art} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block">{title}</span>
              <span className="m-foot m-dim block">{sub}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Podsumowanie: każdy krok jednym wierszem; dotknięcie otwiera krok do poprawki. Uwagi spójności na górze. */
function Summary({ draft, today, editing, onEdit, onRemove }: { draft: Draft; today: string; editing: boolean; onEdit: (s: Step) => void; onRemove?: () => void }) {
  const notes = checks(draft, today).filter((c) => c.id !== 'health_doctor')
  const health = healthScreen(draft.health)
  const rows: Step[] = ['time', 'time_detail', 'current', 'measure', 'gear', 'body', 'health', 'goal_detail', 'consent']
  return (
    <>
      <div className="ob-hero">
        <img src={ART.coach} alt="" width={96} height={128} className="ob-coach-sm" />
        <h1 className="m-title">{editing ? 'Twoje potrzeby' : 'Sprawdź, czy wszystko się zgadza'}</h1>
        <p className="m-sub m-dim">Dotknij wiersza, żeby poprawić.</p>
      </div>
      {health.level === 'doctor' && (
        <Notice tone="red" title="Najpierw lekarz">
          Plan będzie tylko spokojny, dopóki lekarz nie pozwoli na mocniejszy trening.
        </Notice>
      )}
      {notes.map((c) => (
        <Notice key={c.id} tone={c.level === 'warn' ? 'orange' : 'blue'} title={c.level === 'warn' ? 'Uwaga' : 'Dobrze wiedzieć'}>
          {c.text}
        </Notice>
      ))}
      <div className="m-list">
        {rows.map((s) => {
          const value = s === 'health' ? (draft.health ? { ok: 'bez przeciwwskazań', caution: 'z ostrożnością', doctor: 'najpierw lekarz' }[health.level] : '') : stepSummary(s, draft)
          const ok = stepValid(s, draft)
          return (
            <button key={s} className="m-row" onClick={() => onEdit(s === 'goal_detail' && !draft.goal?.type ? 'goal' : s)}>
              <span className="min-w-0 flex-1">
                <span className="block">{s === 'goal_detail' ? 'Cel' : STEP_TITLE[s]}</span>
                <span className={`m-foot block ${ok ? 'm-dim' : 'ob-missing'}`}>{ok ? value || '—' : 'do uzupełnienia'}</span>
              </span>
              <span className="m-dim-3 shrink-0 rotate-180">
                <IconChevronLeft size={18} />
              </span>
            </button>
          )
        })}
      </div>
      <p className="m-foot m-dim px-1">Z tych danych powstanie Twój plan. Zmienisz je w każdej chwili w Ja → Twoje potrzeby.</p>
      {onRemove && (
        <div className="m-list">
          <button className="m-row ob-danger" onClick={onRemove}>
            Usuń moje odpowiedzi i wycofaj zgodę
          </button>
        </div>
      )}
    </>
  )
}

/**
 * „Gotowe!” z podglądem planu (docs/32 § 6): pierwszy tydzień dzień po dniu i liczby o całym planie, liczone
 * generatorem z zapisanego profilu. Bez profilu (np. odświeżenie strony) zostaje sam komunikat.
 */
function Done({ draft, profile, today }: { draft: Draft; profile: AthleteProfile | null; today: string }) {
  const doctor = healthScreen(draft.health).level === 'doctor'
  const preview = useMemo(() => {
    if (!profile) return null
    try {
      return planPreview(profile, today)
    } catch {
      return null
    }
  }, [profile, today])
  return (
    <>
      <div className="ob-hero ob-done">
        <img src="/m/art/ob-done.png" alt="" width={140} height={140} />
        <h1 className="m-display">Gotowe!</h1>
        <p className="m-sub m-dim">
          {preview
            ? `Twój plan: ${preview.weeks} tygodni, do ${num(preview.hours_per_week)} h jazdy tygodniowo. Zmienisz potrzeby w każdej chwili w Ja → Twoje potrzeby.`
            : 'Zapisaliśmy Twoje potrzeby. Z nich powstanie Twój plan. Zmienisz je w każdej chwili w Ja → Twoje potrzeby.'}
        </p>
      </div>
      {doctor && (
        <Notice tone="red" title="Najpierw lekarz">
          Do czasu rozmowy z lekarzem plan będzie tylko spokojny.
        </Notice>
      )}
      {preview && (
        <>
          <section className="flex flex-col gap-2" data-testid="plan-preview">
            <h2 className="m-eyebrow px-1">Pierwszy tydzień · {num(preview.first_week_hours)} h</h2>
            <div className="m-list">
              {preview.first_week.map((d) => (
                <div key={d.weekday} className="m-row">
                  <span className="m-num m-dim w-8 shrink-0 uppercase">{DAY_SHORT[d.weekday]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${d.name ? '' : 'm-dim'}`}>{d.name ?? 'Wolne'}</span>
                    {d.test && <span className="m-foot m-dim block">test kalibracyjny – od niego liczą się strefy</span>}
                  </span>
                  {d.duration_min > 0 && <span className="m-num m-dim shrink-0">{fmtMinutes(d.duration_min)}</span>}
                </div>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="m-eyebrow px-1">Fazy planu</h2>
            <div className="m-list">
              {preview.phases.map((ph) => (
                <div key={ph.name} className="m-row">
                  <span className="min-w-0 flex-1 truncate">{ph.name}</span>
                  <span className="m-num m-dim shrink-0">{ph.weeks} tyg.</span>
                </div>
              ))}
            </div>
          </section>
          {preview.notes.map((n) => (
            <Notice key={n} tone="blue" title="Dobrze wiedzieć">
              {n}
            </Notice>
          ))}
          <p className="m-foot m-dim px-1">Plan liczy kod z Twoich odpowiedzi – trener go tylko objaśnia. Kolejne tygodnie zobaczysz w zakładce Plan, gdy plan zostanie przypisany do konta.</p>
        </>
      )}
    </>
  )
}
