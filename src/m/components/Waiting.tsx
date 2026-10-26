import type { ReactNode } from 'react'
import '../feedback.css'
import { useT } from '@/i18n/react'

/**
 * Animacja oczekiwania (docs/27 § 6): czarno-biały rysunek kreską z fal.ai (`public/m/wait/`), ruch w CSS – koło się
 * kręci, linie wiatru płyną, przy „ogranicz ruch” obrazek stoi. Tylko przy dłuższych czekaniach (≥ ~2 s: Bolt,
 * synchronizacja, rozpoznawanie posiłku, odpowiedź trenera); krótkie akcje mają kółko w przycisku (`Spinner`).
 */
export type WaitVariant = 'wheel' | 'rider' | 'clip'

/** Wybrany wariant (docs/27 § 6): klip z fal.ai – jeden obrót korby, pętla 1 s. Pozostałe zostają do porównania (`/m/czekanie`). */
export const WAIT_VARIANT: WaitVariant = 'clip'

const BASE = `${import.meta.env.BASE_URL}m/wait/`

/** Linie wiatru – lekko falujące, jak rysowane ręką; płyną w lewo za kołem. */
function Wind({ x, y, w }: { x: number; y: number; w: number }) {
  const lines = [
    { dy: 0, len: 1, delay: 0 },
    { dy: 0.22, len: 0.7, delay: -0.35 },
    { dy: 0.44, len: 0.85, delay: -0.7 },
  ]
  return (
    <g className="mw-wind">
      {lines.map((l, i) => {
        const yy = y + l.dy * w
        const ww = w * l.len
        return (
          <path
            key={i}
            d={`M${x} ${yy} q ${ww * 0.25} ${-w * 0.035} ${ww * 0.5} 0 t ${ww * 0.5} 0`}
            style={{ animationDelay: `${l.delay}s` }}
          />
        )
      })}
    </g>
  )
}

/** Szprychy na obracającej się warstwie – rysunek rowerzysty ma puste koła (tylko opona i piasta). */
function Spokes({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g className="mw-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 6
        return <line key={i} x1={cx - r * Math.cos(a)} y1={cy - r * Math.sin(a)} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} />
      })}
    </g>
  )
}

/** Sam obrazek (bez tekstu) – do kart i arkuszy; `size` to szerokość w pt. */
export function WaitArt({ variant = WAIT_VARIANT, size = 96 }: { variant?: WaitVariant; size?: number }) {
  // przy „ogranicz ruch” pierwsza klatka zamiast animowanego WebP (CSS nie zatrzyma animacji w obrazku)
  if (variant === 'clip')
    return (
      <picture className="mw-clip" aria-hidden>
        <source srcSet={`${BASE}wait-clip-still.webp`} media="(prefers-reduced-motion: reduce)" />
        <img src={`${BASE}wait-clip.webp`} alt="" width={size} height={Math.round((size * 243) / 260)} />
      </picture>
    )
  if (variant === 'rider')
    return (
      <svg viewBox="-150 0 630 473" width={size} height={(size * 473) / 630} className="mw-art" aria-hidden>
        <Wind x={-140} y={150} w={130} />
        <g className="mw-bob">
          <image href={`${BASE}wait-rider.png`} x={0} y={0} width={480} height={473} />
        </g>
        <Spokes cx={97} cy={373} r={78} />
        <Spokes cx={382} cy={375} r={78} />
        <g className="mw-ground">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={-120 + i * 150} y1={470} x2={-60 + i * 150} y2={470} />
          ))}
        </g>
      </svg>
    )
  return (
    <svg viewBox="-170 0 540 380" width={size} height={(size * 380) / 540} className="mw-art" aria-hidden>
      <Wind x={-160} y={120} w={150} />
      <g className="mw-spin" style={{ transformOrigin: '180px 180px' }}>
        <image href={`${BASE}wait-wheel.png`} x={0} y={0} width={360} height={360} />
      </g>
      <g className="mw-ground">
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={-150 + i * 150} y1={374} x2={-80 + i * 150} y2={374} />
        ))}
      </g>
    </svg>
  )
}

/**
 * Oczekiwanie na miejscu akcji: rysunek, opis tego, co się dzieje, i opcjonalnie „Anuluj”. Tekst jest w regionie
 * `aria-live`, więc VoiceOver przeczyta go raz, a obrazek jest ukryty przed czytnikiem.
 */
export function Waiting({ label, detail, onCancel, variant, size = 112, children }: { label: string; detail?: string; onCancel?: () => void; variant?: WaitVariant; size?: number; children?: ReactNode }) {
  const t = useT()
  return (
    <div className="mw-wait" role="status" aria-live="polite">
      <WaitArt variant={variant} size={size} />
      <p className="m-headline">{label}</p>
      {detail && <p className="m-sub m-dim">{detail}</p>}
      {children}
      {onCancel && (
        <button type="button" className="m-headline m-hit mt-1" style={{ color: 'var(--accent)' }} onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </div>
  )
}

/** Kółko aktywności jak `UIActivityIndicatorView` (8 kresek) – w przyciskach i wierszach podczas krótkiej akcji. */
export function Spinner({ size = 18, light }: { size?: number; light?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`mw-spinner ${light ? 'mw-spinner-light' : ''}`} aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="12" y1="3" x2="12" y2="7.5" transform={`rotate(${i * 45} 12 12)`} style={{ opacity: 0.25 + (i / 8) * 0.75 }} />
      ))}
    </svg>
  )
}
