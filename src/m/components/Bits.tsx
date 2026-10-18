import type { DayPlan } from '@/engine/plan'
import type { ResolvedWorkout } from '@/engine/types'
import { mainTarget } from '@/day/summary'
import { zoneColor } from '@/lib/zones'

/** Kolor oceny jazdy (rideVerdict.tone): dobrze zielony, tak sobie pomarańczowy, źle czerwony. */
export const TONE_COLOR: Record<'good' | 'ok' | 'warn', string> = { good: 'var(--green)', ok: 'var(--orange)', warn: 'var(--red)' }

/** Mała liczba z podpisem – trzy obok siebie na karcie. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--fill)' }}>
      <div className="m-num whitespace-nowrap text-[18px] font-bold leading-6 tracking-tight">{value}</div>
      <div className="m-foot m-dim">{label}</div>
    </div>
  )
}

/** Cele głównego kroku pracy: waty, tętno, kadencja (albo RPE bez miernika). */
export function Targets({ day }: { day: DayPlan }) {
  const t = day.workout ? mainTarget(day.workout) : null
  if (!t) return null
  const cells = [t.watts ? { v: `${t.watts[0]}–${t.watts[1]}`, l: 'W' } : null, t.bpm ? { v: `${t.bpm[0]}–${t.bpm[1]}`, l: 'bpm' } : null, t.cadence ? { v: `${t.cadence[0]}–${t.cadence[1]}`, l: 'rpm' } : { v: `${t.rpe[0]}–${t.rpe[1]}`, l: 'RPE' }].filter((x): x is { v: string; l: string } => !!x)
  return (
    <div className={`mt-3 grid gap-2 grid-cols-${cells.length}`}>
      {cells.map((c) => (
        <Stat key={c.l} value={c.v} label={c.l} />
      ))}
    </div>
  )
}

/** Pasek struktury treningu – szerokość odcinka proporcjonalna do czasu kroku, kolor = strefa. */
export function StructureBar({ workout, height = 10 }: { workout: ResolvedWorkout; height?: number }) {
  const total = workout.steps.reduce((a, s) => a + s.duration_s, 0) || 1
  return (
    <div className="flex w-full gap-px overflow-hidden rounded-full" style={{ height }} role="img" aria-label="Struktura treningu">
      {workout.steps.map((s, i) => (
        <div key={i} className={zoneColor(s.zone)} style={{ width: `${(s.duration_s / total) * 100}%` }} />
      ))}
    </div>
  )
}

/** RPE 1–10 jednym dotknięciem – zapis natychmiastowy, bez „Zapisz”. */
export function RpeRow({ value, onPick, color = 'var(--day)' }: { value: number | null | undefined; onPick: (rpe: number) => void; color?: string }) {
  return (
    <div>
      <p className="m-foot m-dim mb-2">{value != null ? `RPE ${value} – zmień jednym dotknięciem` : 'Jak ciężko było? RPE 1–10'}</p>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="RPE">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)} className="m-num min-h-10 rounded-lg text-[15px] font-semibold" style={value === v ? { background: color, color: '#fff' } : { background: 'var(--fill)', color: 'var(--label)' }}>
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
