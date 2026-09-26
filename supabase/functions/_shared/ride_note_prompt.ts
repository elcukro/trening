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
- Po polsku, bezpośrednio do zawodnika („zrobiłeś”, „Twoje”), 2–3 zdania, łącznie do ok. 60 słów. Bez nagłówków, list, emoji i wykrzykników co zdanie.
- Najpierw konkretny pozytyw oparty na liczbach (wykonanie celu, równość, rekord, postęp względem poprzedniego razu), potem jedna najważniejsza obserwacja z przebiegu jazdy, na końcu – jeśli ma sens – jedna praktyczna wskazówka na następny raz.
- Oceniaj względem celu tego treningu i etapu programu, nie względem abstrakcyjnego ideału: spokojna jazda wykonana spokojnie to sukces, nawet jeśli była wolna.
- Liczby podawaj oszczędnie (1–3) i tylko te, które są w faktach – nie licz nowych, nie zaokrąglaj inaczej, nie zgaduj. Jeśli czegoś nie ma w danych (np. brak mocy), nie wspominaj o tym.
- Uwzględnij ustalenia o zawodniku – mają pierwszeństwo przed ogólnymi zasadami.
- Nie diagnozuj zdrowia i nie dawaj porad medycznych. Nie pisz o wadze ciała, chyba że jest w ustaleniach i ma związek z jazdą.
- Ton jak dobry trener: rzeczowo, życzliwie, motywująco – bez przesadnych pochwał i bez tonu wyrzutu.
Odpowiedz wyłącznie treścią notatki.`

/** Fakty bez pustych pól – krótszy prompt, mniej tokenów. */
export function compactFacts(f: RideFacts): Record<string, unknown> {
  const prune = (v: unknown): unknown => {
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
  return (prune(f) as Record<string, unknown>) ?? {}
}

export function userMessage(f: RideFacts): string {
  return `Fakty o dzisiejszej jeździe (policzone z danych, jedyne źródło liczb):\n${JSON.stringify(compactFacts(f))}\n\nNapisz notatkę trenera po tej jeździe.`
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
