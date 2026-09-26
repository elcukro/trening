/**
 * Szablony maili: poranna odprawa (dni z treningiem) i podsumowanie po wykonanym treningu.
 * Czysty TypeScript bez Deno i bez silnika – dostaje gotowy „model widoku” (liczby już policzone),
 * żeby ten sam kod działał w Edge Function i w testach Vitest.
 *
 * HTML pod klientów poczty: układ tabelami, style inline, szerokość 600 px, bez obrazków i webfontów
 * (Gmail i Apple Mail tną <style> w <head> różnie – wszystko, co ważne, jest inline).
 */

export interface EmailOut {
  subject: string
  html: string
  text: string
  /** podgląd w skrzynce (preheader) */
  preheader: string
}

export interface StepView {
  name: string
  minutes: number
  zone: string
  /** np. „132–141 bpm” */
  hr?: string | null
  /** np. „176–188 W” */
  watts?: string | null
  cadence?: string | null
  /** np. „2/3” przy powtórzeniach */
  repeat?: string | null
}

export interface MorningView {
  athlete: string
  appUrl: string
  /** „sobota, 26 września” */
  dateLabel: string
  /** „Tydzień 2 · Pomiar wejściowy” */
  weekLabel: string
  /** „351 dni do wyjazdu” */
  countdown?: string | null
  workout: {
    name: string
    minutes: number
    key: boolean
    bike: string
    description: string
    steps: StepView[]
    /** pełna oś czasu (z każdym powtórzeniem); bez niej pasek rysuje wiersze tabeli */
    timeline?: { zone: string; minutes: number }[]
  } | null
  gym?: { name: string; minutes: number; items: string[] } | null
  nutrition: { label: string; carbs?: string | null; protein?: string | null; after?: string | null }
  /** krótkie przypomnienia dnia (reguły, test, pogoda) */
  notes?: string[]
}

export interface ZoneShare {
  zone: string
  label: string
  pct: number
}

export interface WorkoutView {
  athlete: string
  appUrl: string
  dateLabel: string
  name: string
  planned?: { name: string; minutes: number } | null
  /** „Zrobione zgodnie z planem” / „Dłużej niż w planie” */
  verdict: { tone: 'good' | 'ok' | 'warn'; text: string }
  stats: { label: string; value: string; unit?: string }[]
  zones: ZoneShare[]
  /** krótkie obserwacje (dryf tętna, kadencja, Pw:HR) */
  insights: string[]
  week?: { label: string; done: string; planned: string; pct: number } | null
  next?: { dateLabel: string; name: string; minutes: number } | null
  /** notatka trenera (AI albo z reguł) – na samej górze maila */
  note?: string | null
}

// ---------------------------------------------------------------- styl

const C = {
  bg: '#f1f5f9',
  card: '#ffffff',
  ink: '#0f172a',
  soft: '#475569',
  mute: '#94a3b8',
  line: '#e2e8f0',
  accent: '#0284c7',
  good: '#059669',
  warn: '#d97706',
}

/** Te same barwy stref co w aplikacji (Tailwind 400–700), jako hex – klient poczty nie zna klas. */
export const ZONE_HEX: Record<string, string> = {
  Z1: '#94a3b8',
  Z2: '#0ea5e9',
  Z3: '#10b981',
  SS: '#facc15',
  Z4: '#f97316',
  THR: '#ef4444',
  Z5a: '#e11d48',
  Z5b: '#c026d3',
  Z5c: '#7e22ce',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

function shell(preheader: string, inner: string, appUrl: string, unsubscribeUrl?: string | null): string {
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Trening</title></head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:${FONT};color:${C.ink};">
${inner}
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:${C.mute};text-align:center;">
Trening · <a href="${esc(appUrl)}" style="color:${C.mute};">otwórz aplikację</a>${unsubscribeUrl ? ` · <a href="${esc(unsubscribeUrl)}" style="color:${C.mute};">wyłącz te maile</a>` : ''}
</td></tr>
</table></td></tr></table></body></html>`
}

function card(inner: string, pad = '24px'): string {
  return `<tr><td style="padding:0 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card};border-radius:16px;border:1px solid ${C.line};"><tr><td bgcolor="${C.card}" style="padding:${pad};background-color:${C.card};border-radius:16px;">${inner}</td></tr></table></td></tr>`
}

function eyebrow(text: string, color = C.soft): string {
  return `<div style="font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${color};">${esc(text)}</div>`
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td bgcolor="${C.accent}" style="background-color:${C.accent};border-radius:12px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background-color:${C.accent};border:1px solid ${C.accent};border-radius:12px;">${esc(label)}</a></td></tr></table>`
}

/** Pasek osi czasu: segmenty szerokości proporcjonalnej do czasu, w kolorach stref. */
function timeline(parts: { zone: string; weight: number }[]): string {
  const total = parts.reduce((a, p) => a + p.weight, 0) || 1
  const cells = parts
    .filter((p) => p.weight > 0)
    .map((p) => `<td width="${Math.max(1, Math.round((p.weight / total) * 100))}%" height="10" bgcolor="${ZONE_HEX[p.zone] ?? C.mute}" style="background-color:${ZONE_HEX[p.zone] ?? C.mute};height:10px;font-size:1px;line-height:10px;">&nbsp;</td>`)
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;border-collapse:separate;"><tr>${cells}</tr></table>`
}

function zoneDot(zone: string): string {
  // kropka jako znak w kolorze – Gmail wycina tła z <span>, a kolor tekstu zostawia
  return `<span style="color:${ZONE_HEX[zone] ?? C.mute};font-size:16px;line-height:16px;">&#9679;</span>&nbsp;&nbsp;`
}

// ---------------------------------------------------------------- poranna odprawa

export function morningEmail(v: MorningView, opts: { unsubscribeUrl?: string | null } = {}): EmailOut {
  const w = v.workout
  const title = w ? w.name : v.gym ? v.gym.name : 'Dzień wolny'
  const subject = w ? `Dziś: ${w.name} · ${hm(w.minutes)}${v.gym ? ' + siłownia' : ''}` : v.gym ? `Dziś: ${v.gym.name}` : 'Dziś odpoczynek'
  const preheader = [w ? `${hm(w.minutes)}${w.key ? ', dzień kluczowy' : ''}` : null, v.nutrition.label, v.countdown].filter(Boolean).join(' · ')

  const head = card(
    `${eyebrow(v.dateLabel)}
<div style="margin-top:6px;font-size:26px;line-height:32px;font-weight:700;">${esc(title)}</div>
<div style="margin-top:6px;font-size:14px;line-height:20px;color:${C.soft};">${esc(v.weekLabel)}${v.countdown ? ` · ${esc(v.countdown)}` : ''}</div>
${
  w
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
<td style="padding-right:24px;"><div style="font-size:22px;font-weight:700;">${esc(hm(w.minutes))}</div><div style="font-size:12px;color:${C.mute};">czas</div></td>
${w.key ? `<td style="padding-right:24px;"><div style="font-size:22px;font-weight:700;color:${C.warn};">★</div><div style="font-size:12px;color:${C.mute};">dzień kluczowy</div></td>` : ''}
<td><div style="font-size:15px;font-weight:600;line-height:22px;">${esc(w.bike)}</div><div style="font-size:12px;color:${C.mute};">rower</div></td>
</tr></table>
<div style="margin-top:16px;">${timeline((w.timeline ?? w.steps).map((s) => ({ zone: s.zone, weight: s.minutes })))}</div>`
    : ''
}
${button('Otwórz dzisiejszy plan', v.appUrl)}`,
  )

  const steps = w
    ? card(
        `${eyebrow('Kroki')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
${w.steps
  .map(
    (s, i) => `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ''}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:15px;line-height:20px;font-weight:600;">${zoneDot(s.zone)}${esc(s.name)}${s.repeat ? ` <span style="color:${C.mute};font-weight:400;">${esc(s.repeat)}</span>` : ''}</td>
<td align="right" style="font-size:15px;font-weight:600;white-space:nowrap;">${esc(hm(s.minutes))}</td></tr>
<tr><td colspan="2" style="padding-left:18px;font-size:13px;line-height:19px;color:${C.soft};">${[s.watts, s.hr, s.cadence ? `${s.cadence} rpm` : null].filter(Boolean).map((x) => esc(x!)).join(' · ') || esc(s.zone)}</td></tr>
</table></td></tr>`,
  )
  .join('')}
</table>
<div style="margin-top:12px;font-size:13px;line-height:20px;color:${C.soft};">${esc(w.description)}</div>`,
      )
    : ''

  const gym = v.gym
    ? card(
        `${eyebrow('Siłownia')}
<div style="margin-top:6px;font-size:17px;font-weight:700;">${esc(v.gym.name)} <span style="font-weight:400;color:${C.mute};">· ${esc(hm(v.gym.minutes))}</span></div>
<ul style="margin:10px 0 0;padding-left:18px;font-size:14px;line-height:22px;color:${C.soft};">${v.gym.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
      )
    : ''

  const food = card(
    `${eyebrow('Jedzenie')}
<div style="margin-top:6px;font-size:15px;line-height:22px;font-weight:600;">${esc(v.nutrition.label)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:14px;line-height:22px;color:${C.soft};">
${v.nutrition.carbs ? `<tr><td style="padding-right:12px;color:${C.mute};">na rowerze</td><td>${esc(v.nutrition.carbs)}</td></tr>` : ''}
${v.nutrition.protein ? `<tr><td style="padding-right:12px;color:${C.mute};">białko</td><td>${esc(v.nutrition.protein)}</td></tr>` : ''}
${v.nutrition.after ? `<tr><td style="padding-right:12px;color:${C.mute};">po treningu</td><td>${esc(v.nutrition.after)}</td></tr>` : ''}
</table>`,
  )

  const notes = v.notes?.length
    ? card(`${eyebrow('Pamiętaj', C.warn)}<ul style="margin:8px 0 0;padding-left:18px;font-size:14px;line-height:22px;">${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`, '18px 24px')
    : ''

  const text = [
    `${v.dateLabel} – ${title}`,
    v.weekLabel + (v.countdown ? ` · ${v.countdown}` : ''),
    '',
    ...(w ? [`${hm(w.minutes)} · ${w.bike}${w.key ? ' · dzień kluczowy' : ''}`, ...w.steps.map((s) => `- ${s.name}${s.repeat ? ` ${s.repeat}` : ''}: ${hm(s.minutes)} ${[s.watts, s.hr].filter(Boolean).join(' / ')}`), ''] : []),
    ...(v.gym ? [`Siłownia: ${v.gym.name}`, ...v.gym.items.map((i) => `- ${i}`), ''] : []),
    `Jedzenie: ${v.nutrition.label}`,
    ...(v.notes ?? []).map((n) => `! ${n}`),
    '',
    v.appUrl,
  ].join('\n')

  return { subject, preheader, text, html: shell(preheader, head + notes + steps + gym + food, v.appUrl, opts.unsubscribeUrl) }
}

// ---------------------------------------------------------------- po treningu

export function workoutEmail(v: WorkoutView, opts: { unsubscribeUrl?: string | null } = {}): EmailOut {
  const tone = v.verdict.tone === 'good' ? C.good : v.verdict.tone === 'warn' ? C.warn : C.accent
  const toneBg = v.verdict.tone === 'good' ? '#ecfdf5' : v.verdict.tone === 'warn' ? '#fffbeb' : '#f0f9ff'
  const subject = `Zrobione: ${v.name} · ${v.stats[0]?.value ?? ''}${v.stats[0]?.unit ? ` ${v.stats[0].unit}` : ''}`
  const preheader = v.note ?? `${v.verdict.text}${v.insights[0] ? ` · ${v.insights[0]}` : ''}`

  const grid = (() => {
    const rows: string[] = []
    for (let i = 0; i < v.stats.length; i += 3) {
      const cells = v.stats
        .slice(i, i + 3)
        .map(
          (s) => `<td width="33%" valign="top" style="padding:12px 8px 12px 0;"><div style="font-size:22px;line-height:26px;font-weight:700;white-space:nowrap;">${esc(s.value)}${s.unit ? `<span style="font-size:13px;font-weight:500;color:${C.soft};"> ${esc(s.unit)}</span>` : ''}</div><div style="font-size:12px;color:${C.mute};margin-top:2px;">${esc(s.label)}</div></td>`,
        )
        .join('')
      rows.push(`<tr>${cells}</tr>`)
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid ${C.line};">${rows.join('')}</table>`
  })()

  const head = card(
    `${eyebrow(`${v.dateLabel} · trening wykonany`, C.good)}
<div style="margin-top:6px;font-size:26px;line-height:32px;font-weight:700;">${esc(v.name)}</div>
${v.planned ? `<div style="margin-top:4px;font-size:14px;color:${C.soft};">w planie: ${esc(v.planned.name)}, ${esc(hm(v.planned.minutes))}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr><td bgcolor="${toneBg}" style="background-color:${toneBg};border-radius:10px;padding:8px 12px;font-size:14px;font-weight:600;color:${tone};">${esc(v.verdict.text)}</td></tr></table>
${grid}`,
  )

  const note = v.note
    ? card(`${eyebrow('Notatka trenera', C.accent)}<div style="margin-top:8px;font-size:16px;line-height:25px;color:${C.ink};">${esc(v.note)}</div>`, '20px 24px')
    : ''

  const zones = v.zones.length
    ? card(
        `${eyebrow('Czas w strefach tętna')}
<div style="margin-top:12px;">${timeline(v.zones.map((z) => ({ zone: z.zone, weight: z.pct })))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;font-size:13px;line-height:22px;">
${v.zones
  .filter((z) => z.pct >= 1)
  .map((z) => `<tr><td>${zoneDot(z.zone)}${esc(z.label)}</td><td align="right" style="font-weight:600;">${Math.round(z.pct)} %</td></tr>`)
  .join('')}
</table>`,
      )
    : ''

  const insights = v.insights.length
    ? card(`${eyebrow('Co widać w danych')}<ul style="margin:8px 0 0;padding-left:18px;font-size:14px;line-height:22px;color:${C.ink};">${v.insights.map((n) => `<li style="margin-bottom:4px;">${esc(n)}</li>`).join('')}</ul>`)
    : ''

  const week = v.week
    ? card(
        `${eyebrow(v.week.label)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
<td style="font-size:20px;font-weight:700;">${esc(v.week.done)} <span style="font-size:14px;font-weight:500;color:${C.soft};">z ${esc(v.week.planned)}</span></td>
<td align="right" style="font-size:14px;font-weight:600;color:${C.soft};">${Math.round(v.week.pct)} %</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.line}" style="margin-top:8px;background-color:${C.line};border-radius:6px;"><tr><td width="${Math.min(100, Math.max(2, Math.round(v.week.pct)))}%" height="8" bgcolor="${C.accent}" style="background-color:${C.accent};height:8px;border-radius:6px;font-size:1px;line-height:8px;">&nbsp;</td><td height="8" style="font-size:1px;line-height:8px;">&nbsp;</td></tr></table>
${v.next ? `<div style="margin-top:16px;font-size:14px;line-height:20px;color:${C.soft};">Następny: <b style="color:${C.ink};">${esc(v.next.name)}</b> · ${esc(v.next.dateLabel)} · ${esc(hm(v.next.minutes))}</div>` : ''}
${button('Zobacz w aplikacji', v.appUrl)}`,
      )
    : card(button('Zobacz w aplikacji', v.appUrl), '8px 24px 24px')

  const text = [
    `${v.dateLabel} – zrobione: ${v.name}`,
    v.verdict.text,
    ...(v.note ? ['', v.note] : []),
    '',
    ...v.stats.map((s) => `${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`),
    '',
    ...v.zones.filter((z) => z.pct >= 1).map((z) => `${z.label}: ${Math.round(z.pct)} %`),
    '',
    ...v.insights.map((i) => `- ${i}`),
    ...(v.week ? ['', `${v.week.label}: ${v.week.done} z ${v.week.planned}`] : []),
    ...(v.next ? [`Następny: ${v.next.name} (${v.next.dateLabel}, ${hm(v.next.minutes)})`] : []),
    '',
    v.appUrl,
  ].join('\n')

  return { subject, preheader, text, html: shell(preheader, head + note + zones + insights + week, v.appUrl, opts.unsubscribeUrl) }
}
