import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isValidISODate } from '@/engine/dates'
import type { ResolvedWorkout } from '@/engine/types'
import { useToast } from '@/components/Toast'
import { seconds, minutes } from '@/lib/format'
import { INTENSITY_LABEL } from '@/lib/labels'
import { zoneColor } from '@/lib/zones'
import { todayISO } from '@/lib/dates'
import { boltLabel } from '@/features/today/WahooStatus'
import { useIosDay } from '../useIos'
import { mainTarget } from '../summary'
import { Btn, Card, List, Row, RowIcon, Screen, Section, Stat } from '../components/Chrome'
import { IconChevron, IconRest, IconWatch } from '../components/Icons'
import { AfterSheet } from '../components/AfterSheet'

function Steps({ workout }: { workout: ResolvedWorkout }) {
  return (
    <List>
      {workout.steps.map((s, i) => {
        // etykieta intensywności tylko wtedy, gdy wnosi coś ponad nazwę kroku („Rozgrzewka · Rozgrzewka” to szum)
        const kind = INTENSITY_LABEL[s.intensity_type]
        const extra = kind && !s.name.toLowerCase().includes(kind.toLowerCase()) ? kind : null
        const targets = [s.watts ? `${s.watts[0]}–${s.watts[1]} W` : null, s.bpm ? `${s.bpm[0]}–${s.bpm[1]} bpm` : `RPE ${s.rpe[0]}–${s.rpe[1]}`, s.cadence_rpm ? `${s.cadence_rpm[0]}–${s.cadence_rpm[1]} rpm` : null, extra].filter(Boolean).join(' · ')
        return (
          <div key={i} className="ios-row items-start">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${zoneColor(s.zone)}`} aria-hidden />
            <span className="min-w-0 flex-1" style={s.depth > 0 ? { paddingLeft: 8 } : undefined}>
              <span className="ios-body block">
                {s.name}
                {s.repeat_label && <span className="ios-foot ios-dim"> ({s.repeat_label})</span>}
              </span>
              <span className="ios-foot ios-dim ios-num mt-0.5 block">{targets}</span>
            </span>
            <span className="ios-body ios-num ios-dim shrink-0">{seconds(s.duration_s)}</span>
          </div>
        )
      })}
    </List>
  )
}

/** Szczegóły treningu dnia: kroki, opis, wysyłka na licznik, wersja pod dachem. */
export function WorkoutScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const date = params.date && isValidISODate(params.date) ? params.date : todayISO()
  const d = useIosDay(date)
  const [sending, setSending] = useState(false)
  const [after, setAfter] = useState(false)

  const day = d.day
  const w = day?.workout
  if (!day || !day.bike || !w) {
    return (
      <Screen title="Trening" back={() => navigate(-1)}>
        <Section>
          <List>
            <Row title="Tego dnia nie ma jazdy" />
          </List>
        </Section>
      </Screen>
    )
  }

  const t = mainTarget(w)
  const bolt = boltLabel(d.bolt)
  const indoorOn = d.view.overrides.some((o) => o.kind === 'indoor')

  async function send() {
    setSending(true)
    try {
      await toast.run('Wysyłam na Bolta…', d.sendToBolt, (s) => (s === 'updated' ? 'Zaktualizowano na Bolcie. Zsynchronizuj licznik.' : 'Wysłano na Bolta. Zsynchronizuj licznik.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen title={w.name} subtitle={minutes(day.bike.duration_min)} back={() => navigate(-1)}>
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex h-2 w-full gap-px overflow-hidden rounded-full">
            {w.steps.map((s, i) => (
              <div key={i} className={zoneColor(s.zone)} style={{ width: `${(s.duration_s / (w.steps.reduce((a, x) => a + x.duration_s, 0) || 1)) * 100}%` }} />
            ))}
          </div>
          {t && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat size="sm" value={t.watts ? `${t.watts[0]}–${t.watts[1]}` : t.zone} unit={t.watts ? 'W' : undefined} label={t.watts ? 'moc na pracy' : 'strefa'} />
              <Stat size="sm" value={t.bpm ? `${t.bpm[0]}–${t.bpm[1]}` : `${t.rpe[0]}–${t.rpe[1]}`} unit={t.bpm ? 'bpm' : 'RPE'} label={t.bpm ? 'tętno' : 'odczucie'} />
              <Stat size="sm" value={t.cadence ? `${t.cadence[0]}–${t.cadence[1]}` : '—'} unit={t.cadence ? 'rpm' : undefined} label="kadencja" />
            </div>
          )}
        </div>
      </Card>

      {!day.lthr && !day.ftp && (
        <Section footer="Bez LTHR i FTP jedziesz po odczuciu (RPE). Po sobotnim teście zakresy pojawią się same.">
          <List>
            <Row title="Brak stref – jedź po RPE" />
          </List>
        </Section>
      )}

      <Section header="Kroki">
        <Steps workout={w} />
      </Section>

      <Section header="Na czym polega">
        <List>
          <Row wrap title={w.description} />
          <Row wrap title="Rower" subtitle={day.bike.bike} />
        </List>
      </Section>

      <Section header="Licznik" footer={bolt ? bolt.text : undefined}>
        <List>
          <Row
            icon={<RowIcon color="var(--teal)"><IconWatch size={18} /></RowIcon>}
            title={d.bolt.kind === 'ok' ? 'Wyślij ponownie na Bolta' : d.bolt.kind === 'stale' ? 'Zaktualizuj na Bolcie' : 'Wyślij na Bolta'}
            onClick={sending ? undefined : () => void send()}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
        </List>
      </Section>

      {day.fallback_workout && (
        <Section header="Gdy pogoda nie pozwala" footer={indoorOn ? 'Plan na dziś jest w wersji pod dachem.' : `Zamiennik: ${day.fallback_workout.name}`}>
          <List>
            <Row
              icon={<RowIcon color="var(--indigo)"><IconRest size={18} /></RowIcon>}
              title={indoorOn ? 'Wróć do jazdy na zewnątrz' : 'Przełącz na wersję pod dachem'}
              onClick={() => {
                const o = d.view.overrides.find((x) => x.kind === 'indoor')
                if (o) void d.view.undo(o.id)
                else void d.view.applyAction({ kind: 'indoor', date, label: '', payload: {} })
              }}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          </List>
        </Section>
      )}

      {date <= todayISO() && (
        <div className="px-4 pb-4">
          <Btn kind="tinted" className="w-full" onClick={() => setAfter(true)}>
            Jak poszło?
          </Btn>
        </div>
      )}

      {after && (
        <AfterSheet
          log={d.rideLog}
          suggested="done"
          onClose={() => setAfter(false)}
          onSave={async (status, extra) => {
            await d.logRide(status, extra)
          }}
        />
      )}
    </Screen>
  )
}
