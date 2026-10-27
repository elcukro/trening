import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { statusFromScore } from '@/engine/analysis'
import { isValidISODate } from '@/engine/dates'
import { zoneDistribution } from '@/engine/zones'
import { useIosDay, useRideScore } from '@/day/useIos'
import { rideSourceLabel } from '@/app/useRides'
import { rideVerdict } from '@/day/dayState'
import { useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes, num } from '@/lib/format'
import { zoneColor } from '@/lib/zones'
import { Btn, Card, Group, Screen } from '../components/Chrome'
import { RpeRow, Stat, TONE_COLOR } from '../components/Bits'
import { dayColor } from '../dayColor'
import { ART } from '../art'
import { useOpenCoach } from '../coach'
import { FitUploadSheet } from '../components/FitUploadSheet'
import { canUploadFit } from '@/sync/fitUpload'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'

const LOGGED = ['done', 'modified']

function decouplingNote(pct: number): string {
  const n = tr().m.summary.decoupling
  if (pct < 5) return n.good
  if (pct < 10) return n.normal
  return n.high
}

/** Podsumowanie po jeździe (docs/24 § 4): trzy liczby, notatka trenera, czas w strefach, szczegóły, RPE jednym dotknięciem. */
export function SummaryScreen() {
  const t = useT()
  const ts = t.m.summary
  const tt = t.m.today
  const params = useParams()
  const toast = useToast()
  const openCoach = useOpenCoach()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const d = useIosDay(date)
  const day = d.day
  const [idx, setIdx] = useState(0)
  const [fitSheet, setFitSheet] = useState(false)
  const navigate = useNavigate()
  const a = d.activities[idx] ?? d.activities[0]
  const score = useRideScore(idx === 0 ? a : undefined, day, d.ftp)
  const back = date === today ? '/m' : `/m/dzien/${date}`
  const color = dayColor(day?.day_type, day?.flags.includes('test'))
  const log = d.rideLog
  const rpe = log?.rpe ?? null

  async function saveRpe(v: number) {
    const status = score != null ? statusFromScore(score) : log && LOGGED.includes(log.status) ? (log.status as 'done' | 'modified') : 'done'
    await toast.run(tt.rpeSaving, () => d.logRide(status, { rpe: v }), () => tt.rpeSaved(v), undefined, { quiet: true, errorTitle: tt.rpeFailed })
  }

  if (!a) {
    return (
      <Screen title={tt.after.summary} subtitle={fmtLong(date)} back={back} day={color}>
        <Card>
          <p className="m-title">{ts.noRide}</p>
          <p className="m-sub m-dim mt-2">{log && LOGGED.includes(log.status) ? ts.manualLogged : ts.afterImport}</p>
          <div className="mt-4">
            <RpeRow value={rpe} onPick={(v) => void saveRpe(v)} />
          </div>
        </Card>
      </Screen>
    )
  }

  const load = d.loadOf(a)
  const verdict = rideVerdict(score)
  const zones = a.hr_histogram && d.lthr ? zoneDistribution(a.hr_histogram, d.view.engine.ctx.program.hr_zones_lthr_fraction, d.lthr).filter((z) => z.seconds > 0) : []
  const zonesTotal = zones.reduce((s, z) => s + z.seconds, 0) || 1
  const continuous = !day?.bike || day.day_type === 'easy' || day.day_type === 'long'
  const km = a.distance_m != null ? a.distance_m / 1000 : null

  return (
    <Screen title={tt.after.summary} subtitle={`${fmtLong(date)}${day?.bike ? ` · ${day.bike.name}` : ''}`} back={back} day={color}>
      {d.activities.length > 1 && (
        <div className="flex gap-2">
          {d.activities.map((x, i) => (
            <button key={x.key} className="m-chip" style={i === idx ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => setIdx(i)}>
              {x.name ?? ts.rideN(i + 1)}
            </button>
          ))}
        </div>
      )}

      <Card day>
        <p className="m-eyebrow" style={{ color: verdict ? TONE_COLOR[verdict.tone] : 'var(--day)' }}>
          {verdict?.text ?? t.m.me.rides.fallbackName}
        </p>
        <p className="m-title mt-1">{a.name}</p>
        <p className="m-foot m-dim">{rideSourceLabel(a)}</p>
        {a.time_only && canUploadFit && (
          <div className="mt-3">
            <p className="m-sub m-dim">{ts.timeOnly(a.app ?? ts.timeOnlyApp)}</p>
            <div className="mt-2">
              <Btn onClick={() => setFitSheet(true)}>{ts.uploadFit}</Btn>
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={score != null ? `${score} %` : '—'} label={tt.after.compliance} />
          <Stat value={load ? String(Math.round(load.tss)) : '—'} label="TSS" />
          <Stat value={continuous && a.decoupling_pct != null ? `${num(a.decoupling_pct)} %` : a.avg_hr ? `${Math.round(a.avg_hr)}` : '—'} label={continuous && a.decoupling_pct != null ? tt.after.hrDrift : tt.after.avgHr} />
        </div>
        {continuous && a.decoupling_pct != null && <p className="m-foot m-dim mt-2">{ts.driftLine(decouplingNote(a.decoupling_pct))}</p>}
        <div className="mt-4">
          <RpeRow value={rpe} onPick={(v) => void saveRpe(v)} />
        </div>
      </Card>

      {a.note && (
        <Card>
          <div className="flex items-center gap-2">
            <img src="/m/art/coach-face.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
            <p className="m-eyebrow">{ts.coachNote}</p>
          </div>
          <p className="m-sub mt-2 whitespace-pre-wrap">{a.note}</p>
          <Btn soft onClick={() => openCoach(ts.coachPrefill)} className="mt-3 w-full">
            {ts.reply}
          </Btn>
        </Card>
      )}

      {zones.length > 0 && (
        <Card>
          <p className="m-eyebrow">{ts.zonesTitle}</p>
          <div className="mt-3 flex h-3 w-full gap-px overflow-hidden rounded-full" role="img" aria-label={ts.zonesAria}>
            {zones.map((z) => (
              <div key={z.id} className={zoneColor(z.id)} style={{ width: `${(z.seconds / zonesTotal) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {zones.map((z) => (
              <div key={z.id} className="m-foot flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${zoneColor(z.id)}`} />
                <span className="m-dim flex-1">{z.id}</span>
                <span className="m-num">{minutes(Math.round(z.seconds / 60))}</span>
                <span className="m-num m-dim w-10 text-right">{Math.round(z.pct)} %</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Group label={ts.stats}>
        <div className="grid grid-cols-3 gap-px" style={{ background: 'var(--separator)' }}>
          {[
            { v: minutes(Math.round(a.moving_time_s / 60)), l: ts.moving },
            { v: km != null ? `${num(km, 1)} km` : '—', l: ts.distance },
            { v: a.elevation_m != null ? `${Math.round(a.elevation_m)} m` : '—', l: ts.elevation },
            { v: a.device_watts && a.np_w ? `${Math.round(a.np_w)} W` : a.device_watts && a.avg_watts ? `${Math.round(a.avg_watts)} W` : '—', l: a.np_w ? 'NP' : ts.avgPower },
            { v: a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : '—', l: tt.after.avgHr },
            { v: a.avg_cadence ? `${Math.round(a.avg_cadence)} rpm` : '—', l: ts.cadence },
          ].map((c) => (
            <div key={c.l} className="px-3 py-3 text-center" style={{ background: 'var(--card)' }}>
              <div className="m-num m-headline whitespace-nowrap">{c.v}</div>
              <div className="m-foot m-dim">{c.l}</div>
            </div>
          ))}
        </div>
      </Group>

      {!a.note && (
        <Btn soft onClick={() => openCoach(ts.coachPrefill)} className="w-full">
          <img src={ART.heart} alt="" width={22} height={22} className="h-5 w-5 object-contain" />
          {ts.tellCoach}
        </Btn>
      )}
      {fitSheet && <FitUploadSheet onClose={() => setFitSheet(false)} onOpenRide={(rideDate) => { setFitSheet(false); navigate(`/m/podsumowanie/${rideDate}`) }} />}
    </Screen>
  )
}
