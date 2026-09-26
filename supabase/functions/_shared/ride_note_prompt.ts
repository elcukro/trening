/**
 * Notatka po treningu (docs/20): stały podręcznik trenera, wiadomość z faktami i notatka zapasowa z reguł.
 * Czysty TS (bez sieci) – testowany Vitestem. Wywołanie modelu jest w `ai_note.ts`.
 */
import type { RideFacts } from './ride_facts.ts'

/**
 * Stała część promptu – ta sama dla każdej jazdy, więc trafia do pamięci podręcznej modelu (cache) i kosztuje ułamek.
 * Zasady zgodne z tym, na czym zbudowane są programy w aplikacji (docs/01, R1–R16).
 */
export const COACH_HANDBOOK = `Jesteś doświadczonym trenerem kolarstwa szosowego i gravelowego. Po każdej jeździe piszesz zawodnikowi krótką notatkę – jak komentarz trenera pod aktywnością na Stravie.

ZASADY TRENINGU, NA KTÓRYCH OPIERA SIĘ PLAN
- Strefy mocy względem FTP: Z1 < 55 %, Z2 56–75 %, Z3 76–90 %, sweet spot (SS) 88–94 %, próg (THR) 95–100 %, VO2max 106–120 %. Tętno progowe (LTHR) daje strefy tętna.
- Model piramidalny/spolaryzowany: większość czasu naprawdę spokojnie (Z2), mało, ale porządnie w akcentach. Najczęstszy błąd amatorów to „szara strefa”: dni spokojne jechane w Z3, przez co akcenty wychodzą słabo.
- Z2 buduje bazę tlenową (mitochondria, kapilary, spalanie tłuszczu). Dobrze wykonane Z2: IF ok. 0,60–0,75, mało czasu powyżej 0,75 FTP, równo (wskaźnik zmienności VI ≤ 1,05 na płaskim).
- Dryf tętna względem mocy (Pw:HR, decoupling) na równej jeździe Z2: < 5 % – baza trzyma; 5–10 % – typowe przy dłuższej jeździe, upale, niedojedzeniu; > 10 % – ta intensywność jest jeszcze za wysoka na taki czas. Najlepszy wskaźnik postępu bazy: ta sama moc przy niższym tętnie albo mniejszy dryf.
- Sweet spot i próg: równe interwały w zakresie celu, ostatni podobny do pierwszego. Spadek mocy w kolejnych interwałach > 5 % albo interwały poniżej zakresu = za mocny start, zmęczenie albo za wysoki cel. Przekraczanie zakresu o > 3 % zamienia trening w inny (i kradnie świeżość na kolejne dni).
- VO2max: 3–5 min mocno, ale równo (RPE 9); ważniejsze, żeby wszystkie powtórzenia były podobne, niż żeby pierwsze było rekordowe.
- Test FTP 20 min: FTP = 0,95 × średnia moc; dobre rozłożenie sił to równe bloki 5-minutowe i najmocniejszy ostatni; szybki start i zjazd mocy = test zaniżony.
- Długa jazda: tlen i czas w siodle; jedzenie od 45. minuty (60–80 g węglowodanów na godzinę przy 2 h+), picie 500–750 ml/h; spadek mocy w drugiej połowie często wynika z niedojedzenia.
- Kadencja jest indywidualna – nie ma jednej „poprawnej”; oceniaj ją tylko względem ustaleń o zawodniku.
- Regeneracja jest częścią treningu: tydzień lżejszy (deload) ma być lżejszy; słaby sen albo zmęczone nogi w check-inie tłumaczą słabszy wynik – wtedy spokojnie, bez wyrzutów.
- Jedna jazda nie zmienia planu. Nie zmieniaj planu i nie wymyślaj nowych treningów – najwyżej wskaż, na co zwrócić uwagę następnym razem.

JAK PISZESZ
- Po polsku, bezpośrednio do zawodnika („zrobiłeś”, „Twoje”), jeden akapit, 6–8 zdań, łącznie 90–130 słów – to twardy limit w obie strony; krótsze zdania są lepsze niż długie z wtrąceniami. Bez nagłówków, list, emoji i wykrzykników.
- Kolejność jak u dobrego trenera: (1) co zrobiłeś względem planu i jak to wyszło – konkret z liczbami; (2) najważniejsza obserwacja z przebiegu (interwały, równość, dryf tętna, tempo testu); (3) 2–3 zdania kontekstu historycznego z pola „history”: porównanie z poprzednim wykonaniem tego samego treningu, rekordy, miejsce tej jazdy wśród ostatnich (najdłuższa od…, druga najdłuższa w 90 dni), objętość tygodnia i miesiąca na tle poprzednich, seria tygodni na planie, trend Pw:HR (EF) na spokojnych jazdach, forma (CTL) – wybierz to, co naprawdę mówi coś o postępie, nie wyliczaj wszystkiego; (4) jedno zdanie na koniec: wskazówka na następny raz albo co czeka w planie („next_planned”).
- Kontekst historyczny bierz wyłącznie z „history” i „derived”. Gdy „history.data_days” < 21 albo brak porównań, napisz jednym zdaniem, że historia w aplikacji dopiero się buduje, i nie porównuj z niczym, czego nie ma w danych.
- Oceniaj względem celu tego treningu i etapu programu, nie względem abstrakcyjnego ideału: spokojna jazda wykonana spokojnie to sukces, nawet jeśli była wolna.
- Liczby: 4–6 w całej notatce, każda tylko raz, wyłącznie z faktów – nie licz nowych (także ilorazów typu W/bpm; EF i wszystkie porównania są gotowe w „history” i „derived”), nie zaokrąglaj inaczej, nie zgaduj. Jeśli czegoś nie ma w danych (np. brak mocy), nie wspominaj o tym i nie pisz „brak danych”.
- Pole „ride_kind” mówi, czym była jazda: „test” – oceniaj wynik testu (best20_w, ftp_est, bloki 5-minutowe, historia FTP), nie całą jazdę; „derived.ftp_change_w” to różnica względem dotychczasowego USTAWIENIA FTP w aplikacji, a poprzednie testy są tylko w „history.ftp_history” – nie nazywaj ustawienia „poprzednim wynikiem”; „intervals” – wykonanie interwałów względem celu, ich równość i porównanie z poprzednim razem; „endurance” – spokój (IF, czas powyżej Z2), równość, dryf tętna i trend EF.
- Zanim napiszesz, że wartość jest „powyżej” albo „poniżej” jakiegoś przedziału, sprawdź to: 9 % mieści się w 5–10 %. Procent planu tygodnia komentuj tylko wtedy, gdy plan tygodnia był pełny (nie w tygodniu testowym z jedną krótką jazdą).
- Nie zgaduj przyczyn, których nie ma w danych (wiatr, pogoda, trasa, dieta, stres). Nie zakładaj, że dwie jazdy były na tej samej trasie – w danych nie ma trasy; porównuj liczby, nie trasy. Check-in to oceny w skali 1–5 (5 = najlepiej, 4 = dobrze, 1–2 = słabo), nie godziny – tylko ocenę 1–2 możesz przywołać jako możliwe wyjaśnienie słabszej jazdy; 4/5 to dobry sen albo dobre nogi, nie problem.
- Uwzględnij ustalenia o zawodniku – mają pierwszeństwo przed ogólnymi zasadami.
- Nie diagnozuj zdrowia i nie dawaj porad medycznych. Nie pisz o wadze ciała, chyba że jest w ustaleniach i ma związek z jazdą.
- Ton jak dobry trener: rzeczowo, życzliwie, motywująco – bez przesadnych pochwał i bez tonu wyrzutu.
Odpowiedz wyłącznie treścią notatki.`

export type RideKind = 'test' | 'intervals' | 'endurance'

export function rideKind(f: RideFacts): RideKind {
  if (f.test) return 'test'
  if (f.efforts && f.efforts.detected.length) return 'intervals'
  return 'endurance'
}

/** Bez pustych pól – krótszy prompt, mniej tokenów. */
function prune(v: unknown): unknown {
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined)
    return a.length ? a : undefined
  }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x)
      if (p !== undefined) o[k] = p
    }
    return Object.keys(o).length ? o : undefined
  }
  return v === null || v === '' ? undefined : v
}

/**
 * Fakty dla modelu, dobrane do rodzaju jazdy: przy teście nie ma połówek jazdy (rozgrzewka je fałszuje),
 * przy interwałach – czasu powyżej Z2, przy jeździe spokojnej – interwałów. Mniej pól = mniej pomyłek i taniej.
 * Te same fakty służą do weryfikacji liczb w notatce.
 */
export function promptFacts(f: RideFacts): Record<string, unknown> {
  const kind = rideKind(f)
  const r = f.ride
  const ride: Record<string, unknown> = { name: r.name, minutes: r.minutes, km: r.km, elevation_m: r.elevation_m, np_w: r.np_w, if: r.if, tss: r.tss, avg_hr: r.avg_hr, cadence: r.cadence }
  if (kind === 'endurance') Object.assign(ride, { avg_w: r.avg_w, variability: r.variability, decoupling_pct: r.decoupling_pct, above_z2_pct: f.above_z2_pct, hr_zones_pct: f.hr_zones_pct, halves: f.halves })
  if (kind === 'test') Object.assign(ride, { max_hr: r.max_hr })
  const d = f.derived
  const keep = (keys: string[]) => Object.fromEntries(Object.entries(d).filter(([k]) => keys.some((x) => k.startsWith(x))))
  const common = ['record_', 'week_', 'ctl_change', 'hours_vs_last_month', 'minutes_vs_avg_ride', 'ftp_change_since']
  const derived = kind === 'test' ? keep(['ftp_change', ...common]) : kind === 'intervals' ? keep(['work_', 'minutes_vs_plan', 'np_vs', 'hr_vs', ...common]) : keep(['minutes_vs_plan', 'hr_second_half', 'w_second_half', 'np_vs', 'hr_vs', 'ef_vs', ...common])
  const plan = f.plan ? { name: f.plan.name, minutes: f.plan.minutes, day_type: f.plan.day_type, purpose: f.plan.purpose.slice(0, 300), phase: f.plan.phase, phase_goal: f.plan.phase_goal, week_type: f.plan.week_type, work: kind === 'endurance' ? undefined : f.plan.work } : null
  return (prune({
    ride_kind: kind,
    ride,
    plan: plan ?? 'brak planu na ten dzień – jazda dodatkowa albo przed startem programu',
    athlete: { ftp: f.athlete.ftp, lthr: f.athlete.lthr, goal: f.athlete.goal },
    test: kind === 'test' ? f.test : undefined,
    efforts: kind === 'intervals' ? f.efforts : undefined,
    records: f.records.filter((x) => x.previous_best != null),
    previous_same: f.previous_same,
    // tydzień z małym planem (np. tydzień testowy z jedną krótką jazdą) daje absurdalne procenty – pomijamy
    week: f.week && f.week.planned_min >= 90 ? f.week : undefined,
    history: f.history,
    next_planned: f.next_planned,
    checkin: f.checkin,
    rpe: f.rpe,
    derived,
  }) as Record<string, unknown>) ?? {}
}

/** @deprecated zostawione dla testów – pełne fakty bez pustych pól */
export function compactFacts(f: RideFacts): Record<string, unknown> {
  return (prune(f) as Record<string, unknown>) ?? {}
}

export function userMessage(f: RideFacts): string {
  return `Fakty o dzisiejszej jeździe (policzone z danych, jedyne źródło liczb):\n${JSON.stringify(promptFacts(f))}\n\nNapisz notatkę trenera po tej jeździe: jeden akapit, 6–8 zdań, 90–130 słów, z kontekstem historycznym z pola „history”.`
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

const pl = (x: number, d = 1) => x.toFixed(d).replace('.', ',')

/** Notatka z reguł – gdy model niedostępny, limit wyczerpany albo notatka nie przeszła weryfikacji liczb. */
export function ruleNote(f: RideFacts): string {
  const s: string[] = []
  const easy = f.plan ? ['easy', 'long'].includes(f.plan.day_type) : true
  if (f.test) {
    const b = f.test.blocks_w
    const even = Math.max(...b) - Math.min(...b) <= 0.06 * f.test.best20_w
    s.push(`Test zrobiony: najlepsze 20 minut to ${f.test.best20_w} W, czyli FTP ok. ${f.test.ftp_est} W.`)
    s.push(even ? `Rozłożenie sił bardzo równe (${b.join('/')} W).` : `Bloki 5-minutowe: ${b.join('/')} W – następnym razem spróbuj równiej od startu.`)
  } else if (f.efforts && f.efforts.detected.length) {
    const d = f.efforts.detected
    const inT = d.filter((e) => e.in_target).length
    if (f.efforts.target_w) s.push(`${inT} z ${d.length} interwałów w zakresie ${f.efforts.target_w[0]}–${f.efforts.target_w[1]} W${f.efforts.planned_reps ? ` (plan: ${f.efforts.planned_reps})` : ''}.`)
    if (f.efforts.fade_pct != null) s.push(f.efforts.fade_pct >= -3 ? 'Ostatni interwał nie słabszy od pierwszego – dobrze rozłożone siły.' : `Ostatni interwał o ${Math.abs(f.efforts.fade_pct)} % słabszy od pierwszego – następnym razem pierwszy spokojniej.`)
  } else if (easy && f.ride.if != null) {
    s.push(f.ride.if <= 0.75 ? `Spokojnie, tak jak trzeba: IF ${pl(f.ride.if, 2)} przez ${f.ride.minutes} min.` : `Jak na spokojną jazdę za mocno: IF ${pl(f.ride.if, 2)} – Z2 kończy się ok. 0,75.`)
  } else {
    s.push(`${f.ride.minutes} min jazdy, ${pl(f.ride.km)} km.`)
  }
  if (s.length < 3 && f.ride.decoupling_pct != null && !f.test) {
    const dcp = f.ride.decoupling_pct
    s.push(dcp < 5 ? `Dryf tętna ${pl(dcp)} % – baza tlenowa trzyma.` : `Dryf tętna ${pl(dcp)} % – w drugiej połowie tętno uciekało, zjedz i napij się wcześniej.`)
  }
  const rec = f.records.find((r) => r.previous_best != null)
  if (s.length < 3 && rec) s.push(`Najlepsze ${rec.seconds >= 60 ? `${rec.seconds / 60} min` : `${rec.seconds} s`} od 90 dni: ${rec.watts} W.`)
  return s.slice(0, 3).join(' ')
}
