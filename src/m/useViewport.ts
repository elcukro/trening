import { useEffect } from 'react'

/**
 * Wysokość okna i widocznego obszaru mierzona w JS, nie w CSS (docs/24 § 6).
 * iOS w trybie PWA po wznowieniu aplikacji podaje przez chwilę (czasem do następnej nawigacji) nieaktualne `100dvh`
 * i `innerHeight` – za małe o kilkadziesiąt pt – przez co korzeń `/m` był za krótki, a pasek wisiał za wysoko.
 * W trybie standalone (zawsze pełny ekran, orientacja pionowa w manifeście) prawdziwą wysokością jest `screen.height`,
 * więc bierzemy większą z obu. Zmienne CSS: `--m-h` (okno), `--m-vvh` i `--m-vv-top` (obszar bez klawiatury – dla czatu;
 * `visualViewport` liczy się tylko, gdy pole tekstowe ma fokus, inaczej jego wysokość też bywa nieaktualna).
 */
export function useViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    const keyboardOpen = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
    }
    const measure = () => {
      const portrait = window.innerWidth <= window.innerHeight || window.screen.width <= window.screen.height
      const h = standalone && portrait ? Math.max(window.innerHeight, window.screen.height) : window.innerHeight
      root.style.setProperty('--m-h', `${h}px`)
      if (vv && keyboardOpen()) {
        root.style.setProperty('--m-vvh', `${Math.round(vv.height)}px`)
        root.style.setProperty('--m-vv-top', `${Math.round(vv.offsetTop)}px`)
      } else {
        root.style.setProperty('--m-vvh', `${h}px`)
        root.style.setProperty('--m-vv-top', '0px')
      }
    }
    const later = () => {
      measure()
      window.setTimeout(measure, 150)
      window.setTimeout(measure, 600)
      window.setTimeout(measure, 1500)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') later()
    }
    later()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', later)
    window.addEventListener('pageshow', later)
    window.addEventListener('focus', later)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', later)
      window.removeEventListener('pageshow', later)
      window.removeEventListener('focus', later)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
      root.style.removeProperty('--m-h')
      root.style.removeProperty('--m-vvh')
      root.style.removeProperty('--m-vv-top')
    }
  }, [])
}
