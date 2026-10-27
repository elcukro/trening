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
import { useIosDay } from '@/day/useIos'
import { mainTarget } from '@/day/summary'
import { Btn, Card, List, Row, RowIcon, Screen, Section, Stat } from '../components/Chrome'
import { IconChevron, IconRest, IconWatch } from '../components/Icons'
import { AfterSheet } from '../components/AfterSheet'
import { useT } from '@/i18n/react'

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
  const tr = useT()
  const tx = tr.ios.workout
  const date = params.date && isValidISODate(params.date) ? params.date : todayISO()
  const d = useIosDay(date)
  const [sending, setSending] = useState(false)
  const [after, setAfter] = useState(false)

  const day = d.day
  const w = day?.workout
  if (!day || !day.bike || !w) {
    return (
      <Screen title={tx.title} back={() => navigate(-1)}>
        <Section>
          <List>
            <Row title={tx.noRide} />
          </List>
        </Section>
      </Screen>
    )
  }

  const target = mainTarget(w)
  const bolt = boltLabel(d.bolt)
  const indoorOn = d.view.overrides.some((o) => o.kind === 'indoor')

  async function send() {
    setSending(true)
    try {
      await toast.run(tr.ios.bolt.sending, d.sendToBolt, (s) => (s === 'updated' ? tr.ios.bolt.updated : tr.ios.bolt.sent))
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
          {target && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat size="sm" value={target.watts ? `${target.watts[0]}–${target.watts[1]}` : target.zone} unit={target.watts ? 'W' : undefined} label={target.watts ? tr.ios.stat.powerAtWork : tr.ios.stat.zone} />
              <Stat size="sm" value={target.bpm ? `${target.bpm[0]}–${target.bpm[1]}` : `${target.rpe[0]}–${target.rpe[1]}`} unit={target.bpm ? 'bpm' : 'RPE'} label={target.bpm ? tr.ios.stat.hr : tr.ios.stat.feel} />
              <Stat size="sm" value={target.cadence ? `${target.cadence[0]}–${target.cadence[1]}` : '—'} unit={target.cadence ? 'rpm' : undefined} label={tr.ios.stat.cadence} />
            </div>
          )}
        </div>
      </Card>

      {!day.lthr && !day.ftp && (
        <Section footer={tx.noZonesFooter}>
          <List>
            <Row title={tx.noZones} />
          </List>
        </Section>
      )}

      <Section header={tx.steps}>
        <Steps workout={w} />
      </Section>

      <Section header={tx.about}>
        <List>
          <Row wrap title={w.description} />
          <Row wrap title={tx.bike} subtitle={day.bike.bike} />
        </List>
      </Section>

      <Section header={tx.computer} footer={bolt ? bolt.text : undefined}>
        <List>
          <Row
            icon={<RowIcon color="var(--teal)"><IconWatch size={18} /></RowIcon>}
            title={d.bolt.kind === 'ok' ? tr.ios.bolt.resend : d.bolt.kind === 'stale' ? tr.ios.bolt.update : tr.ios.bolt.send}
            onClick={sending ? undefined : () => void send()}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
        </List>
      </Section>

      {day.fallback_workout && (
        <Section header={tx.fallback} footer={indoorOn ? tx.indoorOn : tx.substitute(day.fallback_workout.name)}>
          <List>
            <Row
              icon={<RowIcon color="var(--indigo)"><IconRest size={18} /></RowIcon>}
              title={indoorOn ? tx.backOutdoor : tx.switchIndoor}
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
            {tr.ios.after.title}
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
