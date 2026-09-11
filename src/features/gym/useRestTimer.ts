import { useCallback, useEffect, useRef, useState } from 'react'

/** Timer przerwy z sygnałem Web Audio (iOS PWA nie wibruje). */
export function useRestTimer() {
  const [remaining, setRemaining] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const endAt = useRef<number | null>(null)
  const audio = useRef<AudioContext | null>(null)

  const beep = useCallback((times = 3) => {
    try {
      audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const ctx = audio.current
      void ctx.resume()
      for (let i = 0; i < times; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        const t = ctx.currentTime + i * 0.25
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
        osc.start(t)
        osc.stop(t + 0.22)
      }
    } catch {
      /* brak audio – trudno */
    }
  }, [])

  /** Odblokowanie AudioContext musi nastąpić w gest użytkownika – wołaj przy starcie sesji. */
  const unlock = useCallback(() => {
    try {
      audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      void audio.current.resume()
    } catch {
      /* ignoruj */
    }
  }, [])

  const start = useCallback((seconds: number) => {
    endAt.current = Date.now() + seconds * 1000
    setTotal(seconds)
    setRemaining(seconds)
  }, [])

  const stop = useCallback(() => {
    endAt.current = null
    setRemaining(null)
  }, [])

  const add = useCallback((seconds: number) => {
    if (endAt.current == null) return
    endAt.current += seconds * 1000
    setTotal((t) => t + seconds)
  }, [])

  const active = remaining !== null
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      if (endAt.current == null) return
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        endAt.current = null
        beep()
        setTimeout(() => setRemaining(null), 1500)
        clearInterval(id)
      }
    }, 250)
    return () => clearInterval(id)
  }, [active, beep])

  return { remaining, total, start, stop, add, unlock }
}

/** Screen Wake Lock – ekran nie gaśnie w trakcie sesji. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* np. niski poziom baterii */
      }
    }
    void request()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
