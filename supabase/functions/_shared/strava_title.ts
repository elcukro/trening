// Tytuł i opis jazdy na Stravie (docs/20 § Tytuł na Stravie). Czysty TS – testy w src/engine/__tests__/strava_title.test.ts.
// Zasada jak w notatce: kod liczy fakty, model pisze, każda liczba musi być w faktach (numbersOk), inaczej tytuł z reguł.
import { numbersOk, type RideFacts } from './ride_facts.ts'
import { promptFacts, rideKind } from './ride_note_prompt.ts'
import { aiLangRule, fix, strings, type Lang } from './i18n.ts'

/** Podpis pod opisem na Stravie w języku zawodnika („Notatki: Bicycle Coach” / „Notes: Bicycle Coach”). */
export function signatureFor(lang: Lang): string {
  return strings(lang).strava.signature
}
/** Podpis polski – zostawiony dla zgodności (testy, stare wywołania). */
export const SIGNATURE = signatureFor('pl')
export const TITLE_MAX = 60

/** Domyślne nazwy Stravy (w kilku językach) i nazwy z planu wysłanego na Bolta – tylko takie nadpisujemy. */
const STRAVA_DEFAULT = /^(morning|lunch|afternoon|evening|night) (gravel |e-bike |mountain bike |virtual |e-mountain bike )?ride$|^(poranna|popołudniowa|wieczorna|nocna) jazda$|^jazda w porze lunchu$|^(indoor cycling|virtual ride|jazda pod dachem|trening na trenażerze)$/i

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\((pod dachem|indoors?)\)$/, '')

/** Czy tytuł jest domyślny (Strava albo nazwa z planu na Bolcie)? Własny tytuł zawodnika zostaje. */
export function isDefaultTitle(name: string, planName: string | null | undefined, pushedNames: string[] = []): boolean {
  const n = norm(name)
  if (!n) return true
  if (STRAVA_DEFAULT.test(n)) return true
  if (planName && norm(planName) === n) return true
  return pushedNames.some((p) => norm(p) === n)
}

export interface TitleDraft {
  title: string
  description: string
}

/** Odpowiedź modelu: dwie linie „Tytuł: …” i „Opis: …” (bez JSON – mniej błędów składni); po angielsku model bywa skłonny pisać „Title:”/„Description:”. */
export function parseDraft(text: string): TitleDraft | null {
  const title = /^\s*(?:tytuł|title)\s*:\s*(.+)$/im.exec(text)?.[1]?.trim()
  const description = /^\s*(?:opis|description)\s*:\s*([\s\S]+)$/im.exec(text)?.[1]?.trim()
  if (!title || !description) return null
  return { title: title.replace(/^["„”]|["„”]$/g, '').trim(), description: description.replace(/\n+/g, ' ').trim() }
}

export interface DraftCheck {
  ok: boolean
  problems: string[]
}

/** Warunki przyjęcia szkicu: długość tytułu, 1–3 zdania opisu, liczby wyłącznie z faktów. */
export function checkDraft(d: TitleDraft, facts: RideFacts): DraftCheck {
  const problems: string[] = []
  if (d.title.length > TITLE_MAX) problems.push(`tytuł za długi: ${d.title.length} znaków`)
  if (d.title.length < 6) problems.push('tytuł za krótki')
  const sentences = d.description.split(/[.!?]+\s|[.!?]+$/).filter((s) => s.trim().length > 0).length
  if (sentences < 1 || sentences > 3) problems.push(`opis ma ${sentences} zdań, ma mieć 1–3`)
  if (d.description.length > 320) problems.push(`opis za długi: ${d.description.length} znaków`)
  const sig = /trener ai|bicycle coach|notatki:|notes:/i
  if (sig.test(d.title) || sig.test(d.description)) problems.push('podpis dopisuje kod, nie model')
  const pf = promptFacts(facts)
  const nums = numbersOk(`${d.title} ${d.description}`, pf)
  if (!nums.ok) problems.push(`liczby spoza faktów: ${nums.unknown.join(', ')}`)
  return { ok: problems.length === 0, problems }
}

/** Tytuł z reguł, gdy model nie dał poprawnego szkicu. */
export function ruleDraft(f: RideFacts, lang: Lang = 'pl'): TitleDraft {
  const T = strings(lang).strava
  const pl = (x: number, d = 0) => fix(x, d, lang)
  const r = f.ride
  const kind = rideKind(f)
  const head = f.plan ? f.plan.name : kind === 'test' ? T.ftpTest : T.unplannedTitle
  const bits: string[] = [`${pl(r.km)} km`]
  if (r.avg_w != null) bits.push(`${pl(r.avg_w)} W`)
  else if (r.avg_hr != null) bits.push(`${pl(r.avg_hr)} bpm`)
  const title = `${head} · ${bits.join(' · ')}`.slice(0, TITLE_MAX)
  const parts: string[] = []
  if (f.plan) parts.push(T.planLine(f.plan.name, f.plan.minutes, r.minutes))
  else parts.push(T.unplannedLine(r.minutes))
  if (r.avg_w != null && r.avg_hr != null) parts.push(T.avgLine(pl(r.avg_w), pl(r.avg_hr)))
  return { title, description: parts.join(' ') }
}

/** Opis z podpisem w języku zawodnika – zawsze dopisuje kod. */
export function withSignature(description: string, lang: Lang = 'pl'): string {
  const d = description.trim()
  return `${d}${d.endsWith('.') || d.endsWith('!') ? '' : '.'}\n\n${signatureFor(lang)}`
}

export function titlePrompt(facts: RideFacts, note: string | null, lang: Lang = 'pl'): string {
  const rule = aiLangRule(lang)
  return [
    'Napisz tytuł i opis tej jazdy na Stravę. Odpowiedz dokładnie w dwóch liniach:',
    'Tytuł: <do 60 znaków, po polsku, bez emoji, bez podpisu; może zawierać 1–2 liczby z faktów, np. „Długa 140 km · 166 W”>',
    'Opis: <1–3 krótkie zdania po polsku, jak komentarz trenera: co było planem, jak poszło, jedna rzecz warta zapamiętania; wyłącznie liczby z faktów, bez własnych obliczeń, bez podpisu>',
    '',
    `FAKTY (JSON):\n${JSON.stringify(promptFacts(facts))}`,
    note ? `\nNOTATKA TRENERA (już sprawdzona, możesz z niej streścić):\n${note}` : '',
    // po angielsku etykiety „Tytuł:” i „Opis:” zostają (parseDraft czyta obie wersje), treść – po angielsku
    rule ? `\n${rule} Etykiety linii zostaw jako „Tytuł:” i „Opis:”; tytuł i opis napisz po angielsku.` : '',
  ].join('\n')
}
