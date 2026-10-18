import { useEffect } from 'react'

/**
 * Wysokość okna mierzona w JS i „leczenie” viewportu (docs/24 § 6).
 *
 * Błąd iOS w PWA ze startu z ekranu początkowego: po pierwszym otwarciu klawiatury (albo po wznowieniu) okno
 * WebView kurczy się o wysokość paska statusu – `innerHeight`, `visualViewport.height` i `100dvh` pokazują
 * np. 894 zamiast 956 i tak zostają aż do ubicia aplikacji. Jedyne, co przywraca pełną wysokość, to przełączenie
 * `display` na elemencie o PEŁNEJ wysokości ekranu (tak działa nawigacja w SPA, która „sama” naprawiała pasek).
 * Robimy to po zamknięciu klawiatury (blur) i po wznowieniu, gdy okno jest niższe od największego widzianego.
 * Zmienne CSS: `--m-h` (okno), `--m-vvh` i `--m-vv-top` (obszar bez klawiatury – dla czatu).
 * Źródła: dev.to/cederhook (keyboard bug), zarda/home-account#493 (podłoga 100lvh).
 */
export function useViewport(): void {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    const portrait = () => window.innerWidth <= window.innerHeight
    // największa wysokość, jaką okno miało – w PWA w pionie punktem wyjścia jest pełny ekran
    let maxSeen = standalone && portrait() ? Math.max(window.innerHeight, window.screen.height) : window.innerHeight
    let heals = 0
    const keyboardOpen = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
    }
    const measure = () => {
      const h = window.innerHeight
      if (h > maxSeen) maxSeen = h
      root.style.setProperty('--m-h', `${h}px`)
      root.dataset.mViewport = `${window.innerWidth}×${h} · ekran ${window.screen.width}×${window.screen.height} · max ${maxSeen} · vv ${vv ? Math.round(vv.height) : '–'}${standalone ? ' · PWA' : ''}${heals ? ` · leczenie ×${heals}` : ''}`
      if (vv && keyboardOpen()) {
        root.style.setProperty('--m-vvh', `${Math.round(vv.height)}px`)
        root.style.setProperty('--m-vv-top', `${Math.round(vv.offsetTop)}px`)
      } else {
        root.style.setProperty('--m-vvh', `${h}px`)
        root.style.setProperty('--m-vv-top', '0px')
      }
    }
    /** Okno niższe niż bywało → element pełnej wysokości znika i wraca, WebKit liczy okno od nowa. */
    const heal = () => {
      if (keyboardOpen() || maxSeen - window.innerHeight <= 4) {
        measure()
        return
      }
      const m = document.querySelector<HTMLElement>('.m')
      if (!m) return
      heals++
      const scroller = m.querySelector<HTMLElement>('.m-scroll')
      const top = scroller?.scrollTop ?? 0
      m.style.height = `${maxSeen}px`
      m.style.display = 'none'
      void m.offsetHeight
      m.style.display = ''
      window.requestAnimationFrame(() => {
        m.style.height = ''
        if (scroller) scroller.scrollTop = top
        measure()
      })
    }
    const healSoon = () => {
      window.setTimeout(heal, 140)
      window.setTimeout(heal, 500)
      window.setTimeout(heal, 1200)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') healSoon()
    }
    const onFocusOut = () => {
      measure()
      healSoon()
    }
    measure()
    healSoon()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', healSoon)
    window.addEventListener('pageshow', healSoon)
    window.addEventListener('focus', healSoon)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('focusin', measure)
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', healSoon)
      window.removeEventListener('pageshow', healSoon)
      window.removeEventListener('focus', healSoon)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('focusin', measure)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
      root.style.removeProperty('--m-h')
      root.style.removeProperty('--m-vvh')
      root.style.removeProperty('--m-vv-top')
      delete root.dataset.mViewport
    }
  }, [])
}
