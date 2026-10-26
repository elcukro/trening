/**
 * Grafiki do mobilnego interfejsu v2 (docs/24 § 5): ilustracja trenera, ikony pogody i typów dnia w jednym stylu
 * (miękki render 3D), generowane przez fal.ai i wycinane z tła (BiRefNet) do PNG z przezroczystością.
 *
 *   FAL_KEY=… node scripts/fal-art.mjs            # wszystkie brakujące
 *   FAL_KEY=… node scripts/fal-art.mjs coach sun  # wybrane (nadpisuje)
 *   FAL_KEY=… node scripts/fal-art.mjs --all      # wszystkie, nadpisuje
 *   node scripts/fal-art.mjs --webp               # warstwy intro z zapisanych wycięć w scratch/ (bez fal.ai)
 *
 * Klucz nie jest w repo – podaj go zmienną środowiskową. Wynik: public/m/art/<id>.png (postacie 512 px, ikony 256 px), surowe w scratch/.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const KEY = process.env.FAL_KEY
if (!KEY && !process.argv.includes('--webp')) {
  console.error('Brak FAL_KEY w środowisku')
  process.exit(1)
}
const OUT = 'public/m/art'
const SCENE_OUT = 'public/m/intro'
const target = (id) => (ASSETS[id].scene ? `${SCENE_OUT}/${id}.webp` : `${OUT}/${id}.png`)
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
const ICON_STYLE = 'Minimal icon: very simple shapes, smooth plastic-like surfaces, flat solid colors with one soft highlight, no texture, no strands, no ornaments, no small details, no swirls. The object floats in mid-air with generous empty margin on every side, absolutely no contact shadow and no shadow below it. ' + STYLE

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
  bolt: { prompt: 'A small bike computer device with a rounded screen showing a simple green route line, mounted on a short handlebar stub.' },
  scale: { prompt: 'A simple bathroom scale in white with a small blue display.' },
  // ikony dolnego paska (docs/24 § 3) – ta sama rodzina co pogoda i typy dnia
  // ikona aplikacji: pełne tło (iOS sam zaokrągla rogi), bez wycinania tła (`raw`), zapis do scratch/icons – wybór ręczny
  'icon-coach': { raw: true, prompt: 'iOS app icon artwork, square, edge-to-edge smooth gradient background from sky blue (#5fb4ff) at top to deep blue (#0a7aff) at bottom, no border, no rounded corners. Centered: the head and shoulders of a friendly 3D clay-style cycling coach mascot (short beard, cycling cap with sunglasses on it, light blue jersey), big and filling about 70% of the icon, soft studio lighting, subtle glossy highlights, no text.' },
  'icon-bike': { raw: true, prompt: 'iOS app icon artwork, square, edge-to-edge smooth gradient background from sky blue (#5fb4ff) at top to deep blue (#0a7aff) at bottom, no border, no rounded corners. Centered: a 3D clay-style green and white gravel bicycle seen from a three-quarter front angle, big and filling about 72% of the icon, soft studio lighting, subtle glossy highlights, no text.' },
  'tab-today': { prompt: 'A calendar page icon in sky blue with a white top bar and a single bold white check mark in the middle.' },
  'tab-plan': { prompt: 'A weekly planner icon: a sky blue rounded square (same proportions as a calendar app icon, seen straight on, not tilted, no perspective) with three horizontal white bars of different lengths, each with a small round orange dot on the left.' },
  'tab-me': { prompt: 'A progress icon: a sky blue rounded square (same proportions as a calendar app icon, seen straight on, not tilted, no perspective) with a bold white rising zigzag arrow pointing up-right.' },
  heart: { prompt: 'A glossy red heart with a thin white heartbeat line across it.' },
  // onboarding (docs/31): jedna ilustracja na krok, ta sama rodzina co ikony dnia
  'ob-time': { prompt: 'A round sky blue alarm clock next to a small orange calendar page, standing together.' },
  'ob-form': { prompt: 'Three rounded bars of rising height in green, sky blue and orange, with a small bold upward arrow above the tallest bar.' },
  'ob-measure': { prompt: 'A small sky blue round gauge dial with an orange needle pointing up-right, next to a small glossy red heart, standing together.' },
  'ob-gear': { prompt: 'A sky blue road bicycle in front of a green gravel bicycle, slightly overlapping, side view, slightly angled.' },
  'ob-consent': { prompt: 'A rounded sky blue shield with a bold white check mark, next to a small closed golden padlock.' },
  'ob-body': { prompt: 'A rolled-up yellow tailor measuring tape with a short loose end, and a small green leaf.' },
  'ob-health': { prompt: 'A glossy red heart with a soft white medical cross on it and a light blue stethoscope curled around it.' },
  'ob-goal': { prompt: 'A small snowy mountain peak in blue and white with a red flag on the top and a winding grey road leading up to it.' },
  'ob-done': { prompt: 'A golden trophy cup with a small sky blue ribbon and two tiny sparkles.' },
  // ekran startowy aplikacji iOS (docs/27): warstwy paralaksy per pora roku (WebP 1800 px do public/m/intro/) i rowerzysta;
  // niebo, słońce/księżyc i pora dnia są w CSS (src/m/intro/)
  ...sceneAssets(),
}

/** Warstwy krajobrazu: szeroki pas na białym tle (do wycięcia), płaski dół, widok z boku jak w grze side-scroller. */
function sceneAssets() {
  const SCENE = 'Soft 3D clay-style diorama render, smooth rounded forms, matte surfaces with subtle glossy highlights, gentle daylight from top-left, ' +
    'friendly saturated colors. Pure side view like a layer of a 2D side-scrolling game, the element spans the full width edge to edge, its bottom edge is flat and straight. ' +
    'Isolated on a plain pure white background (no sky, no clouds, no sun), no text, no people, no frame.'
  const seasons = {
    spring: { far: 'blue-grey alpine mountain range with big white snow caps', near: 'fresh light green rolling hills with a few round trees in pink and white blossom and small yellow flowers', road: 'fresh green grass with tiny yellow and white flowers' },
    summer: { far: 'blue-grey alpine mountain range with only small patches of snow on the highest peaks', near: 'lush deep green rolling hills with round green trees and a few dark green pines', road: 'lush green grass' },
    autumn: { far: 'blue-grey alpine mountain range with fresh light snow on the peaks', near: 'golden-ochre rolling hills with round trees in orange, red and yellow autumn foliage and a few dark green pines', road: 'golden-brown grass with a few fallen orange leaves' },
    winter: { far: 'alpine mountain range completely covered in white snow with pale blue shadows', near: 'rolling hills fully covered in smooth white snow with snowy dark green pine trees', road: 'smooth white snow' },
  }
  const out = {}
  for (const [k, v] of Object.entries(seasons)) {
    out[`intro-${k}-far`] = { scene: true, prompt: `A wide panorama of a distant ${v.far}, several overlapping peaks of different heights. ${SCENE}` }
    out[`intro-${k}-near`] = { scene: true, prompt: `A wide band of ${v.near}, gentle low hills, much lower than mountains. ${SCENE}` }
    out[`intro-${k}-road`] = { scene: true, prompt: `A long thin horizontal ground strip seen exactly from the side: a smooth dark grey asphalt road with a thin white edge line on top of a rounded strip of earth, ${v.road} along the top edge of the road. Flat cross-section, no perspective, no vanishing point. ${SCENE}` }
  }
  out['intro-rider'] = { scene: true, ratio: '1:1', width: 480, prompt: 'A friendly cycling coach mascot riding a light blue road bike, pure side view facing right, pedalling, slightly leaning forward: stylized 3D character with short beard, white cycling helmet, sunglasses, light blue cycling jersey, black shorts, white shoes, both wheels fully visible. ' + STYLE }
  return out
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
  const gen = await fal('fal-ai/nano-banana-pro', { prompt: a.raw || a.scene ? a.prompt : `${a.prompt} ${a.ratio ? STYLE : ICON_STYLE}`, aspect_ratio: a.ratio ?? (a.scene ? '21:9' : '1:1'), resolution: '1K', output_format: 'png', num_images: 1 })
  const src = gen.images?.[0]?.url
  if (!src) throw new Error(`brak obrazu: ${JSON.stringify(gen).slice(0, 200)}`)
  writeFileSync(`${RAW}/${id}.png`, await download(src))
  if (a.scene) return saveScene(id, a, src)
  if (a.raw) {
    console.log(`✓ ${id} → ${RAW}/${id}.png (bez wycinania tła)`)
    return
  }
  // 2) wycięcie tła
  const cut = await fal('fal-ai/birefnet/v2', { image_url: src, model: 'General Use (Heavy)', operating_resolution: '1024x1024', output_format: 'png', refine_foreground: true })
  const png = await download(cut.image.url)
  const file = `${OUT}/${id}.png`
  writeFileSync(file, png)
  // 3) zmniejszenie do 512 px (sips zachowuje kanał alfa)
  execFileSync('sips', ['-Z', String(a.ratio ? 512 : 256), file], { stdio: 'ignore' })
  console.log(`✓ ${id} (${Math.round((Date.now() - t0) / 1000)} s)`)
}

/** Warstwa sceny: wycięte tło, WebP z kanałem alfa (cwebp z Homebrew) – nie trafia do precache PWA (tylko png). */
async function saveScene(id, a, src) {
  const cut = await fal('fal-ai/birefnet/v2', { image_url: src, model: 'General Use (Heavy)', operating_resolution: '2048x2048', output_format: 'png', refine_foreground: true })
  const png = `${RAW}/${id}-cut.png`
  writeFileSync(png, await download(cut.image.url))
  toWebp(id, a)
}

/** `${RAW}/<id>-cut.png` → `public/m/intro/<id>.webp` (osobno, żeby zmienić kadr albo jakość bez ponownej generacji: `--webp`). */
function toWebp(id, a) {
  const png = `${RAW}/${id}-cut.png`
  mkdirSync(SCENE_OUT, { recursive: true })
  // przycięcie do treści (kanał alfa), żeby warstwy dało się ustawiać od dołu bez zgadywania pustego marginesu
  const crop = trimBox(png)
  execFileSync('cwebp', ['-quiet', '-q', '78', '-alpha_q', '85', ...(crop ? ['-crop', ...crop] : []), '-resize', String(a.width ?? 1800), '0', png, '-o', target(id)])
  console.log(`✓ ${id} → ${target(id)}`)
}

/** Prostokąt nieprzezroczystej treści PNG (x y w h) – przez Pillow, bo w projekcie nie ma biblioteki obrazów dla Node. */
function trimBox(png) {
  try {
    const py = 'import sys\nfrom PIL import Image\nb=Image.open(sys.argv[1]).getchannel("A").point(lambda v:255 if v>8 else 0).getbbox()\nprint(b[0],b[1],b[2]-b[0],b[3]-b[1])'
    return execFileSync('python3', ['-I', '-c', py, png]).toString().trim().split(' ')
  } catch {
    console.warn('  (bez przycięcia – brak python3 z Pillow)')
    return null
  }
}

const args = process.argv.slice(2)
const all = args.includes('--all')
if (args.includes('--webp')) {
  for (const id of Object.keys(ASSETS).filter((id) => ASSETS[id].scene && existsSync(`${RAW}/${id}-cut.png`))) toWebp(id, ASSETS[id])
  process.exit(0)
}
const ids = args.filter((x) => !x.startsWith('--'))
const todo = ids.length ? ids : Object.keys(ASSETS).filter((id) => all || (!ASSETS[id].raw && !existsSync(target(id))))
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
