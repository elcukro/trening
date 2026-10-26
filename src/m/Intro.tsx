import { useEffect, useState } from 'react'
import { nowHour, todayISO, urlParam } from '@/lib/dates'
import { IS_IOS_APP, firstScreenDrawn, holdSplash, revealSplash, statusBarLight } from '@/native'
import { introScene, parseScene, sceneImages, type IntroScene } from './introScene'
import './intro.css'

/** Najkrótsze intro (ms): warstwy dojeżdżają, rowerzysta wjeżdża. Dłużej tylko, gdy `/m` jeszcze się nie narysował. */
const PLAY_MS = 1300
/** Najdłużej (ms) od pokazania sceny – potem intro znika, nawet gdy aplikacja dalej czeka na dane. */
const MAX_MS = 3500
/** Ile czekać na wczytanie warstw (z pakietu aplikacji – szybko), zanim intro się podda i start idzie bez niego. */
const LOAD_MS = 1500
/** W podglądzie obrazy idą z serwera deweloperskiego – dłużej. */
const PREVIEW_LOAD_MS = 8000
const OUT_MS = 380

const SKY_ART = ['/m/art/sun.png', '/m/art/night.png', '/m/art/cloud.png']

interface Request {
  scene: IntroScene
  /** Podgląd (zrzuty, e2e): scena zostaje do dotknięcia. */
  hold: boolean
}

/**
 * Czy pokazać intro: w aplikacji iOS przy każdym zimnym starcie (bez „ogranicz ruch”), a poza nią tylko na żądanie –
 * `?intro=autumn-morning` (albo `?intro=now`) w podglądzie, `VITE_INTRO_PREVIEW` w buildzie do zrzutów z symulatora.
 */
function request(): Request | null {
  const preview = import.meta.env.VITE_INTRO_PREVIEW || urlParam('intro')
  if (preview) return { scene: parseScene(preview) ?? introScene(todayISO(), nowHour()), hold: true }
  if (!IS_IOS_APP) return null
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  return { scene: introScene(todayISO(), nowHour()), hold: false }
}

/** Raz na uruchomienie – powrót z tła nie powtarza intro (komponent żyje, dopóki WebView). */
let played = false

/**
 * Animowany ekran startowy aplikacji iOS (docs/27 § Stan wdrożenia): po natywnym ekranie startowym (#f2f2f7) krótka
 * scena paralaksy w stylu grafik `/m` – krajobraz pory roku, niebo pory dnia i wjeżdżający rowerzysta. Aplikacja ładuje
 * dane pod spodem, dotknięcie pomija intro, a scena znika, gdy pierwszy ekran `/m` jest gotowy.
 */
export function Intro() {
  const [req] = useState(() => (played ? null : request()))
  if (!req) return null
  return <IntroScreen req={req} />
}

function IntroScreen({ req }: { req: Request }) {
  const { scene, hold } = req
  const [phase, setPhase] = useState<'load' | 'play' | 'out' | 'done'>('load')
  // przejęcie ekranu startowego już przy pierwszym renderze – zanim `/m` zdąży go schować
  const [release] = useState(() => holdSplash())
  const dark = scene.time === 'evening' || scene.time === 'night'

  // 1) warstwy wczytane i zdekodowane → odsłonięcie sceny spod ekranu startowego; inaczej start bez intro
  useEffect(() => {
    played = true
    let alive = true
    const fail = window.setTimeout(() => alive && setPhase('done'), hold ? PREVIEW_LOAD_MS : LOAD_MS)
    const load = (src: string) => {
      const img = new Image()
      img.src = src
      return img.decode()
    }
    Promise.all([...sceneImages(scene), ...SKY_ART].map(load)).then(
      () => {
        if (!alive) return
        window.clearTimeout(fail)
        if (dark) statusBarLight(true)
        setPhase('play')
        revealSplash()
      },
      () => alive && setPhase('done'),
    )
    return () => {
      alive = false
      window.clearTimeout(fail)
    }
  }, [scene, dark, hold])

  // 2) koniec: po animacji i narysowaniu `/m` (najdłużej MAX_MS); w podglądzie dopiero po dotknięciu
  useEffect(() => {
    if (phase !== 'play' || hold) return
    let alive = true
    const min = new Promise((r) => window.setTimeout(r, PLAY_MS))
    const max = new Promise((r) => window.setTimeout(r, MAX_MS))
    void Promise.race([Promise.all([min, firstScreenDrawn()]), max]).then(() => alive && setPhase('out'))
    return () => {
      alive = false
    }
  }, [phase, hold])

  // 3) zanikanie i zwolnienie ekranu startowego (gdy intro się poddało, `/m` sam go schowa)
  useEffect(() => {
    if (phase === 'out') {
      if (dark) statusBarLight(false)
      const t = window.setTimeout(() => setPhase('done'), OUT_MS)
      return () => window.clearTimeout(t)
    }
    if (phase === 'done') {
      release()
      if (dark) statusBarLight(false)
    }
  }, [phase, dark, release])

  if (phase === 'done') return null
  return (
    <div
      className="intro"
      data-season={scene.season}
      data-time={scene.time}
      data-phase={phase}
      data-testid="intro"
      aria-hidden="true"
      onPointerDown={() => phase === 'play' && setPhase('out')}
    >
      {scene.time === 'night' && <div className="intro-stars" />}
      <img className="intro-sky-art intro-orb" src={scene.time === 'night' ? '/m/art/night.png' : '/m/art/sun.png'} alt="" />
      <img className="intro-sky-art intro-cloud intro-cloud-a" src="/m/art/cloud.png" alt="" />
      <img className="intro-sky-art intro-cloud intro-cloud-b" src="/m/art/cloud.png" alt="" />
      <div className="intro-land">
        <div className="intro-fill" />
        <img className="intro-layer intro-far" src={`/m/intro/intro-${scene.season}-far.webp`} alt="" />
        <img className="intro-layer intro-near" src={`/m/intro/intro-${scene.season}-near.webp`} alt="" />
        <img className="intro-layer intro-road" src={`/m/intro/intro-${scene.season}-road.webp`} alt="" />
      </div>
      <div className="intro-rider">
        {scene.time === 'night' && <span className="intro-beam" />}
        <img src="/m/intro/intro-rider.webp" alt="" />
      </div>
    </div>
  )
}
