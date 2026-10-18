// „Zapytaj trenera” (docs/23): czat z trenerem w /i. Czysty TS (bez sieci) – prompt, definicje narzędzi,
// sanityzacja historii rozmowy i kontekstu z aplikacji. Testy: src/engine/__tests__/coach_chat.test.ts.
//
// Podział ról: aplikacja buduje kontekst (plan, jazdy, check-iny – ma silnik i bazę lokalną) i WYKONUJE narzędzia
// (zapis do Dexie z outboxem, walidacja przeniesień silnikiem, wysyłka na Bolta); Edge Function tylko rozmawia
// z modelem i pilnuje limitów. Każde wywołanie modelu to jeden wpis w `ai_calls`.

export type Role = 'user' | 'assistant'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  // bloki myślenia modeli Claude 5 – w turze z narzędziem muszą wrócić do modelu bez zmian (podpis)
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }

export interface Message {
  role: Role
  content: string | Block[]
}

export const TOOL_NAMES = ['save_checkin', 'set_rpe', 'mark_skipped', 'move_ride', 'push_wahoo'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

const DATE = { type: 'string', description: 'data ISO YYYY-MM-DD' }

/** Narzędzia modelu – wykonuje je aplikacja (src/ios/coachTools.ts), tu tylko opis dla modelu. */
export const TOOLS = [
  {
    name: 'save_checkin',
    description: 'Zapisuje poranny check-in dnia (waga, tętno spoczynkowe, sen/nogi/motywacja 1–5, choroba, uwagi). Pola pominięte zostają bez zmian. Użyj od razu, gdy zawodnik podaje te dane.',
    input_schema: {
      type: 'object',
      properties: {
        date: { ...DATE, description: 'data ISO; domyślnie dziś' },
        weight_kg: { type: 'number', description: 'masa w kg, np. 104.8' },
        resting_hr: { type: 'integer', description: 'tętno spoczynkowe w bpm' },
        sleep: { type: 'integer', minimum: 1, maximum: 5 },
        legs: { type: 'integer', minimum: 1, maximum: 5, description: '1 = ciężkie, 5 = lekkie' },
        motivation: { type: 'integer', minimum: 1, maximum: 5 },
        sick: { type: 'boolean' },
        notes: { type: 'string', description: 'krótka uwaga (ból, stres, objawy) – bez powtarzania liczb' },
      },
    },
  },
  {
    name: 'set_rpe',
    description: 'Zapisuje ocenę wysiłku jazdy (RPE 1–10) dla dnia; opcjonalnie notatkę po jeździe.',
    input_schema: { type: 'object', properties: { date: { ...DATE, description: 'data ISO; domyślnie dziś' }, rpe: { type: 'integer', minimum: 1, maximum: 10 }, notes: { type: 'string' } }, required: ['rpe'] },
  },
  {
    name: 'mark_skipped',
    description: 'Oznacza trening dnia jako pominięty (jazda nie odbędzie się / nie odbyła). Zapytaj najpierw, chyba że zawodnik wyraźnie o to prosi.',
    input_schema: { type: 'object', properties: { date: DATE, reason: { type: 'string', description: 'powód jednym zdaniem' } }, required: ['date'] },
  },
  {
    name: 'move_ride',
    description: 'Przenosi jazdę z jednego dnia na inny dzień WOLNY (bez jazdy i bez siłowni). Aplikacja sprawdza reguły planu i odmawia, gdy przeniesienie je łamie – wtedy przekaż powód. Zapytaj najpierw, chyba że zawodnik wyraźnie o to prosi.',
    input_schema: { type: 'object', properties: { from: { ...DATE, description: 'dzień z jazdą' }, to: { ...DATE, description: 'dzień wolny' } }, required: ['from', 'to'] },
  },
  {
    name: 'push_wahoo',
    description: 'Wysyła plan (dziś + 6 dni, z nadpisaniami) na licznik Wahoo ELEMNT Bolt. Po przeniesieniu albo pominięciu jazdy zaproponuj to zawodnikowi.',
    input_schema: { type: 'object', properties: {} },
  },
] as const

export const COACH_SYSTEM = `Jesteś trenerem kolarskim tego zawodnika i rozmawiasz z nim w jego aplikacji treningowej (czat na telefonie). Znasz jego plan, ostatnie jazdy, check-iny i ustalenia – wszystko jest w KONTEKŚCIE (JSON) na początku rozmowy. Kontekst jest odświeżany przy każdej wiadomości, więc po zapisie narzędziem widzisz już nowe dane.

ZASADY TRENINGU, NA KTÓRYCH OPIERA SIĘ PLAN
- Strefy mocy względem FTP: Z1 < 55 %, Z2 56–75 %, Z3 76–90 %, sweet spot 88–94 %, próg 95–100 %, VO2max 106–120 %. Większość czasu spokojnie (Z2), mało, ale porządnie w akcentach; „szara strefa” to najczęstszy błąd.
- Plan jest deterministyczny i powstaje poza rozmową. Nie wymyślasz nowych treningów ani nie zmieniasz struktury planu. Możesz: przenieść jazdę na dzień wolny, oznaczyć ją jako pominiętą, zapisać check-in i RPE, wysłać plan na Bolta. Nic więcej.
- Kryteria luzowania (spadek formy, nie zmęczenie): tętno spoczynkowe > średnia z 7 dni + 7 bpm dwa dni z rzędu; nogi ≤ 2 albo suma ocen check-inu ≤ 6 dwa dni z rzędu; moc do tętna na Z2 niżej o > 5 % niż średnia z 3 ostatnich; sweet spot nie wchodzi w zakres; tętno nie chce iść w górę przy dużym RPE; choroba. Wtedy 3–4 dni Z1/wolne i powrót. Gotowe sygnały są w „flags” – gdy są, mów o nich wprost.
- Choroba (gorączka, infekcja poniżej szyi): bez treningu; katar bez gorączki: co najwyżej Z1–Z2. Nie diagnozujesz, nie dajesz porad medycznych – przy objawach, które niepokoją, odsyłasz do lekarza jednym zdaniem.
- Regeneracja jest częścią treningu. Jedna jazda nie zmienia planu.

NARZĘDZIA
- Gdy zawodnik podaje dane (waga, tętno, sen, nogi, motywacja, RPE, „jutro bez jazdy”), zapisuj je od razu narzędziem, bez dopytywania o rzeczy, które nie padły. Słowa na skalę 1–5: fatalnie=1, słabo=2, średnio/ok=3, dobrze=4, świetnie=5; „nogi ciężkie”=2, „lekkie”=4. Liczba 40–200 z dziesiątkami to waga; 30–120 przy słowach tętno/puls to tętno. Przecinek dziesiętny traktuj jak kropkę.
- Przeniesienie jazdy, pominięcie treningu i wysyłka na Bolta zmieniają plan – wykonaj je bez pytania tylko wtedy, gdy zawodnik wyraźnie o to prosi („przenieś sobotę na niedzielę”, „jutro odpuszczam”, „wyślij na Bolta”). Gdy sam to proponujesz, zapytaj jednym zdaniem i czekaj na zgodę.
- Dzień, na który przenosisz, musi być wolny (w „days” bez „bike” i „gym”). Gdy narzędzie odmówi, przekaż powód i zaproponuj inny dzień z listy.
- Po przeniesieniu albo pominięciu zaproponuj wysyłkę na Bolta (jedno zdanie), chyba że zawodnik już o nią poprosił.
- Po wykonaniu narzędzia potwierdź jednym krótkim zdaniem, co zapisałeś; nie powtarzaj wszystkich wartości.

JAK PISZESZ
- Po polsku, bezpośrednio do zawodnika („Ty”), krótko: zwykle 1–4 zdania, czystym tekstem – bez nagłówków, list, emoji i bez znaczników markdown (żadnych gwiazdek ** ani _). Na pytanie o plan albo o jazdę odpowiadasz konkretem z kontekstu. Liczby dziesiętne z przecinkiem.
- Każda liczba, której używasz, musi pochodzić z kontekstu (plan, jazdy, check-iny) albo z wiadomości zawodnika; nie licz nowych wskaźników i nie zgaduj. Jeśli czegoś nie ma w danych, mówisz, że tego nie widzisz.
- Uwzględniasz ustalenia o zawodniku („athlete.coach_notes”) – mają pierwszeństwo przed ogólnymi zasadami.
- Ton: rzeczowo, życzliwie, bez pochlebstw i bez wyrzutów.`

const MAX_MESSAGES = 40
const MAX_TEXT = 4000
const MAX_TOTAL = 60_000
export const MAX_CONTEXT = 40_000

const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.slice(0, max) : null)

function sanitizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  switch (b.type) {
    case 'text': {
      const text = str(b.text, MAX_TEXT)
      return text != null && text.trim() ? { type: 'text', text } : null
    }
    case 'tool_use': {
      const id = str(b.id, 100)
      const name = str(b.name, 50)
      if (!id || !name || !(TOOL_NAMES as readonly string[]).includes(name)) return null
      const input = b.input && typeof b.input === 'object' && !Array.isArray(b.input) ? (b.input as Record<string, unknown>) : {}
      return { type: 'tool_use', id, name, input }
    }
    case 'tool_result': {
      const id = str(b.tool_use_id, 100)
      const content = typeof b.content === 'string' ? b.content.slice(0, MAX_TEXT) : ''
      return id ? { type: 'tool_result', tool_use_id: id, content, ...(b.is_error === true ? { is_error: true } : {}) } : null
    }
    case 'thinking': {
      const thinking = typeof b.thinking === 'string' ? b.thinking : null
      const signature = str(b.signature, 20_000)
      return thinking != null && signature ? { type: 'thinking', thinking, signature } : null
    }
    case 'redacted_thinking': {
      const data = str(b.data, 50_000)
      return data ? { type: 'redacted_thinking', data } : null
    }
    default:
      return null
  }
}

/**
 * Historia rozmowy z aplikacji → wiadomości do modelu: tylko znane role i typy bloków, ostatnie MAX_MESSAGES,
 * wiadomość zaczyna się od użytkownika, role się przeplatają (sąsiednie tej samej roli sklejamy).
 */
export function sanitizeMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return []
  const out: Message[] = []
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue
    const role = (m as Record<string, unknown>).role
    if (role !== 'user' && role !== 'assistant') continue
    const c = (m as Record<string, unknown>).content
    let content: Block[]
    if (typeof c === 'string') content = c.trim() ? [{ type: 'text', text: c.slice(0, MAX_TEXT) }] : []
    else if (Array.isArray(c)) content = c.map(sanitizeBlock).filter((b): b is Block => !!b)
    else continue
    if (!content.length) continue
    const last = out.at(-1)
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...content)
    else out.push({ role, content })
  }
  while (out.length && out[0]!.role !== 'user') out.shift()
  // bloki tool_result tylko bezpośrednio po tool_use o tym samym id; osierocone zamieniamy w tekst
  const seen = new Set<string>()
  for (const m of out) {
    if (!Array.isArray(m.content)) continue
    m.content = m.content.flatMap((b): Block[] => {
      if (b.type === 'tool_use') {
        seen.add(b.id)
        return [b]
      }
      if (b.type === 'tool_result') return seen.has(b.tool_use_id) ? [b] : []
      return [b]
    })
  }
  const kept = out.filter((m) => (m.content as Block[]).length)
  // bloki myślenia są potrzebne tylko w ostatniej turze asystenta (kontynuacja narzędzia) – starsze wyrzucamy, bo nic nie dają
  const lastAssistant = kept.map((m) => m.role).lastIndexOf('assistant')
  kept.forEach((m, i) => {
    if (m.role === 'assistant' && i !== lastAssistant) m.content = (m.content as Block[]).filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking')
  })
  // twardy limit znaków – obcinamy od początku rozmowy
  let total = kept.reduce((s, m) => s + JSON.stringify(m.content).length, 0)
  while (kept.length > 1 && total > MAX_TOTAL) {
    total -= JSON.stringify(kept[0]!.content).length
    kept.shift()
    while (kept.length && kept[0]!.role !== 'user') kept.shift()
  }
  return kept.filter((m) => (m.content as Block[]).length)
}

/** Kontekst z aplikacji – obiekt JSON ograniczony rozmiarem; cokolwiek innego = brak kontekstu. */
export function sanitizeContext(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = JSON.stringify(raw)
  return s.length <= MAX_CONTEXT ? s : null
}

/** Kontekst wchodzi jako pierwszy blok pierwszej wiadomości użytkownika – model widzi go przed pytaniem. */
export function withContext(messages: Message[], context: string | null): Message[] {
  if (!messages.length || !context) return messages
  const [first, ...rest] = messages
  const content = typeof first!.content === 'string' ? [{ type: 'text', text: first!.content } as Block] : first!.content
  return [{ role: 'user', content: [{ type: 'text', text: `KONTEKST (JSON, dane z aplikacji):\n${context}` }, ...content] }, ...rest]
}

/** Odpowiedź modelu → tekst do wyświetlenia i wywołania narzędzi do wykonania w aplikacji. */
export function splitAssistant(content: Block[]): { text: string; tools: { id: string; name: ToolName; input: Record<string, unknown> }[] } {
  return {
    text: content
      .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim(),
    tools: content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name as ToolName, input: b.input })),
  }
}
