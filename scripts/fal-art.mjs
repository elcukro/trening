/**
 * Grafiki do mobilnego interfejsu v2 (docs/24 § 5): ilustracja trenera, ikony pogody i typów dnia w jednym stylu
 * (miękki render 3D), generowane przez fal.ai i wycinane z tła (BiRefNet) do PNG z przezroczystością.
 *
 *   FAL_KEY=… node scripts/fal-art.mjs            # wszystkie brakujące
 *   FAL_KEY=… node scripts/fal-art.mjs coach sun  # wybrane (nadpisuje)
 *   FAL_KEY=… node scripts/fal-art.mjs --all      # wszystkie, nadpisuje
 *
 * Klucz nie jest w repo – podaj go zmienną środowiskową. Wynik: public/m/art/<id>.png (postacie 512 px, ikony 256 px), surowe w scratch/.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const KEY = process.env.FAL_KEY
if (!KEY) {
  console.error('Brak FAL_KEY w środowisku')
  process.exit(1)
}
const OUT = 'public/m/art'
const RAW = process.env.FAL_RAW_DIR ?? 'scratch/fal-raw'
mkdirSync(OUT, { recursive: true })
mkdirSync(RAW, { recursive: true })

/** Wspólny styl – jeden opis dla całego zestawu, żeby ikony wyglądały jak jedna rodzina. */
const STYLE =
  'Soft 3D clay-style render, smooth rounded forms, matte surfaces with subtle glossy highlights, gentle studio lighting from top-left, ' +
  'fresh saturated but friendly colors (sky blue, warm orange, leaf green, soft white), slight depth and volume, centered composition, ' +
  'single isolated object, plain pure white background, no ground shadow, no text, no letters, no watermark, no frame.'

const COACH =
  'Friendly cycling coach mascot: stylized 3D character, waist-up, athletic build, short beard, cycling cap, sunglasses pushed up on the cap, ' +
  'light blue cycling jersey, holding a small tablet, warm confident smile, slightly turned three-quarter view.'

/** Ikony: bez faktury i ozdób – jedna bryła, 2–3 kolory, czytelna w 40–80 px. */
const ICON_STYLE = 'Minimal icon: very simple shapes, smooth plastic-like surfaces, flat solid colors with one soft highlight, no texture, no strands, no ornaments, no small details, no swirls. ' + STYLE

/** id → prompt. Pogoda i typy dnia mają być równie prostymi bryłami, żeby działały w 40–80 px. */
const ASSETS = {
  coach: { prompt: COACH, ratio: '3:4' },
  'coach-wave': { prompt: COACH.replace('holding a small tablet', 'waving with one hand'), ratio: '3:4' },
  sun: { prompt: 'A bright round sun with soft rounded rays, warm yellow-orange.' },
  'partly-cloudy': { prompt: 'A small sun peeking from behind a fluffy white cloud.' },
  cloud: { prompt: 'A single fluffy white-grey cloud, nothing else, no sun.' },
  rain: { prompt: 'A grey cloud with three blue raindrops falling below it.' },
  storm: { prompt: 'A dark grey cloud with a yellow lightning bolt below it.' },
  snow: { prompt: 'A white cloud with three pale blue snowflakes below it.' },
  fog: { prompt: 'A pale grey cloud with three soft horizontal haze bars below it, everything in shades of grey only, monochrome.' },
  wind: { prompt: 'Three curling wind swooshes in light blue, flowing to the right, with a small leaf.' },
  night: { prompt: 'A crescent moon in soft yellow with two tiny stars.' },
  'ride-easy': { prompt: 'A gravel bicycle in green and white, side view, slightly angled.' },
  'ride-key': { prompt: 'A bicycle in orange with a bold lightning bolt above the saddle, dynamic feel.' },
  'ride-long': { prompt: 'A small green hill with a grey winding road going up and over it, a tiny cyclist on the road, one small round tree.' },
  test: { prompt: 'A red stopwatch with a bold tick mark, chunky and simple.' },
  rest: { prompt: 'A steaming coffee cup in cream and brown on a small saucer.' },
  gym: { prompt: 'A chunky blue dumbbell, slightly angled.' },
  bolt: { prompt: 'A small bike computer device with a rounded screen showing a simple green route line, mounted on a short handlebar stub.' },
  scale: { prompt: 'A simple bathroom scale in white with a small blue display.' },
  heart: { prompt: 'A glossy red heart with a thin white heartbeat line across it.' },
}

async function fal(path, body) {
  const res = await fetch(`https://fal.run/${path}`, {
    method: 'POST',
    headers: { authorization: `Key ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json()
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(out).slice(0, 300)}`)
  return out
}

/** Adresy wynikowe z odpowiedzi fal – tylko https i znane hosty fal; plik musi być PNG i mieć rozsądny rozmiar. */
const ALLOWED_HOSTS = ['fal.media', 'fal.ai', 'fal.run', 'storage.googleapis.com']
const MAX_BYTES = 20 * 1024 * 1024
async function download(url) {
  const u = new URL(String(url))
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) throw new Error(`niedozwolony adres: ${u.hostname}`)
  const r = await fetch(u, { redirect: 'error' })
  if (!r.ok) throw new Error(`pobieranie ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('plik za duży')
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('to nie jest PNG')
  return buf
}

async function make(id) {
  const a = ASSETS[id]
  const t0 = Date.now()
  // 1) generacja (Gemini 3 Pro Image przez fal – dobrze trzyma styl zestawu)
  const gen = await fal('fal-ai/nano-banana-pro', { prompt: `${a.prompt} ${a.ratio ? STYLE : ICON_STYLE}`, aspect_ratio: a.ratio ?? '1:1', resolution: '1K', output_format: 'png', num_images: 1 })
  const src = gen.images?.[0]?.url
  if (!src) throw new Error(`brak obrazu: ${JSON.stringify(gen).slice(0, 200)}`)
  writeFileSync(`${RAW}/${id}.png`, await download(src))
  // 2) wycięcie tła
  const cut = await fal('fal-ai/birefnet/v2', { image_url: src, model: 'General Use (Heavy)', operating_resolution: '1024x1024', output_format: 'png', refine_foreground: true })
  const png = await download(cut.image.url)
  const file = `${OUT}/${id}.png`
  writeFileSync(file, png)
  // 3) zmniejszenie do 512 px (sips zachowuje kanał alfa)
  execFileSync('sips', ['-Z', String(a.ratio ? 512 : 256), file], { stdio: 'ignore' })
  console.log(`✓ ${id} (${Math.round((Date.now() - t0) / 1000)} s)`)
}

const args = process.argv.slice(2)
const all = args.includes('--all')
const ids = args.filter((x) => !x.startsWith('--'))
const todo = ids.length ? ids : Object.keys(ASSETS).filter((id) => all || !existsSync(`${OUT}/${id}.png`))
for (const id of todo) if (!ASSETS[id]) throw new Error(`nieznany id: ${id}`)
console.log(`Generuję ${todo.length}: ${todo.join(', ')}`)

let failed = 0
const queue = [...todo]
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const id = queue.shift()
      try {
        await make(id)
      } catch (e) {
        failed++
        console.error(`✗ ${id}: ${e.message}`)
      }
    }
  }),
)
if (failed) process.exit(1)
