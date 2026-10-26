import { useNavigate, useParams } from 'react-router'
import { isValidISODate } from '@/engine/dates'
import type { ResolvedWorkout } from '@/engine/types'
import { useIosDay } from '@/day/useIos'
import { structureLabel } from '@/day/summary'
import { useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_LABEL, INTENSITY_LABEL } from '@/lib/labels'
import { zoneColor } from '@/lib/zones'
import { Btn, Card, Group, Screen } from '../components/Chrome'
import { StructureBar, Targets } from '../components/Bits'
import { dayColor } from '../dayColor'
import { ART, dayArt } from '../art'

const dur = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)

/** Kroki jako pionowa oś czasu: kolor strefy, nazwa, cele, czas; powtórzenia wcięte. */
export function StepsList({ workout }: { workout: ResolvedWorkout }) {
  return (
    <div className="m-list">
      {workout.steps.map((s, i) => {
        const kind = INTENSITY_LABEL[s.intensity_type]
        const extra = kind && !s.name.toLowerCase().includes(kind.toLowerCase()) ? kind : null
        return (
          <div key={i} className="m-row" style={{ paddingLeft: 16 + s.depth * 14 }}>
            <span className={`h-9 w-1.5 shrink-0 rounded-full ${zoneColor(s.zone)}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {s.name}
                {s.repeat_label ? <span className="m-dim"> {s.repeat_label}</span> : null}
              </span>
              <span className="m-foot m-dim block">
                {[s.zone, s.watts ? `${s.watts[0]}–${s.watts[1]} W` : null, s.bpm ? `${s.bpm[0]}–${s.bpm[1]} bpm` : `RPE ${s.rpe[0]}–${s.rpe[1]}`, s.cadence_rpm ? `${s.cadence_rpm[0]}–${s.cadence_rpm[1]} rpm` : null, extra].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="m-num m-dim shrink-0">{dur(s.duration_s)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Pełny ekran jazdy (docs/24 § 4): struktura, cele, kroki, wersja pod dachem i wysyłka na Bolta. Bez pogody – ta jest na karcie dnia. */
export function RideScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const d = useIosDay(date)
  const day = d.day
  const w = day?.workout
  const back = date === today ? '/m' : `/m/dzien/${date}`

  if (!day || !day.bike || !w) {
    return (
      <Screen title="Jazda" subtitle={fmtLong(date)} back={back}>
        <Card>
          <p className="m-sub m-dim">Tego dnia nie ma jazdy w planie.</p>
        </Card>
      </Screen>
    )
  }

  const color = dayColor(day.day_type, day.flags.includes('test'))
  const indoorOn = d.view.overrides.some((o) => o.kind === 'indoor')
  const indoorOverride = d.view.overrides.find((o) => o.kind === 'indoor')
  const structure = structureLabel(w)
  const sendBolt = () => void toast.run('Wysyłam na Bolta…', d.sendToBolt, (s) => (s === 'updated' ? 'Zaktualizowano na Bolcie. Zsynchronizuj licznik.' : 'Wysłano na Bolta. Zsynchronizuj licznik.'))

  return (
    <Screen title={w.name} subtitle={`${fmtLong(date)} · ${minutes(day.bike.duration_min)}`} back={back} day={color}>
      <Card day>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
              {day.flags.includes('test') ? 'Test' : DAY_TYPE_LABEL[day.day_type]}
              {structure ? ` · ${structure}` : ''}
              {indoorOn ? ' · pod dachem' : ''}
            </p>
            <p className="m-big mt-1">{minutes(day.bike.duration_min)}</p>
          </div>
          <img src={dayArt(day.day_type, day.flags.includes('test'))} alt="" width={80} height={80} className="-mt-1 -mr-1 h-20 w-20 shrink-0 object-contain" />
        </div>
        <div className="mt-3">
          <StructureBar workout={w} />
        </div>
        <Targets day={day} />
        {!day.lthr && !day.ftp && <p className="m-foot m-dim mt-3">Bez LTHR i FTP jedziesz po odczuciu (RPE). Po teście zakresy pojawią się same.</p>}
        {d.bolt.kind !== 'na' && (
          <p className="m-sub mt-3 flex items-center gap-2">
            <img src={ART.bolt} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            <span style={{ color: d.bolt.kind === 'ok' ? 'var(--green)' : d.bolt.kind === 'error' ? 'var(--red)' : 'var(--label-2)' }}>{d.bolt.kind === 'ok' ? 'Na liczniku' : d.bolt.kind === 'stale' ? 'Na liczniku jest stara wersja' : d.bolt.kind === 'error' ? `Bolt: ${d.bolt.error}` : 'Jeszcze nie na liczniku'}</span>
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {d.bolt.kind !== 'na' && d.bolt.kind !== 'ok' && date >= today && (
            <Btn onClick={sendBolt} className="w-full">
              Wyślij na Bolta
            </Btn>
          )}
          {day.fallback_workout && !indoorOn && (
            <Btn soft onClick={() => void d.view.applyAction({ kind: 'indoor', date, label: '', payload: {} })} className="w-full">
              Wersja pod dachem
            </Btn>
          )}
          {indoorOverride && (
            <Btn soft onClick={() => void d.view.undo(indoorOverride.id)} className="w-full">
              Wróć do wersji na dworze
            </Btn>
          )}
        </div>
      </Card>

      {w.description && <p className="m-sub m-dim px-1">{w.description}</p>}

      <Group label="Kroki">
        <StepsList workout={w} />
      </Group>

      {day.fallback_workout && !indoorOn && (
        <Group label="Pod dachem">
          <div className="m-row">
            <span className="min-w-0 flex-1">
              <span className="block">{day.fallback_workout.name}</span>
              <span className="m-foot m-dim block">{minutes(day.fallback_workout.duration_min)} · na trenażerze, gdy pogoda nie puszcza</span>
            </span>
          </div>
        </Group>
      )}
      <button className="m-foot m-dim m-hit px-1 text-left" onClick={() => navigate(back)}>
        Odprawa (pogoda, ubiór, jedzenie) jest na karcie dnia.
      </button>
    </Screen>
  )
}
