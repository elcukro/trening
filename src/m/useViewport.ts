import { useEffect } from 'react'

/**
 * Wysokość okna i widocznego obszaru mierzona w JS, nie w CSS (docs/24 § 6).
 * iOS w trybie PWA po wznowieniu aplikacji podaje przez chwilę nieaktualne `100dvh` i `env(safe-area-inset-*)`,
 * przez co korzeń `/m` był za krótki, a pasek wisiał za wysoko. Mierzymy `innerHeight` i `visualViewport`
 * i wpisujemy do zmiennych CSS: `--m-h` (okno), `--m-vvh` i `--m-vv-top` (obszar bez klawiatury – dla czatu).
 * Pomiar powtarzamy po wznowieniu z opóźnieniem, bo iOS poprawia wartości dopiero po kilkuset ms.
 */
export function useViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    const measure = () => {
      root.style.setProperty('--m-h', `${window.innerHeight}px`)
      if (vv) {
        root.style.setProperty('--m-vvh', `${Math.round(vv.height)}px`)
        root.style.setProperty('--m-vv-top', `${Math.round(vv.offsetTop)}px`)
      }
    }
    const later = () => {
      measure()
      window.setTimeout(measure, 150)
      window.setTimeout(measure, 600)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') later()
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', later)
    window.addEventListener('pageshow', later)
    window.addEventListener('focus', later)
    document.addEventListener('visibilitychange', onVisible)
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', later)
      window.removeEventListener('pageshow', later)
      window.removeEventListener('focus', later)
      document.removeEventListener('visibilitychange', onVisible)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
      root.style.removeProperty('--m-h')
      root.style.removeProperty('--m-vvh')
      root.style.removeProperty('--m-vv-top')
    }
  }, [])
}
