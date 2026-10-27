import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { onSharedFit } from '@/native'
import { useToast } from '@/components/Toast'
import { t } from '@/i18n'

// plik .fit przysłany z „Udostępnij” (docs/33 § 7a) czeka tu, aż ekran Ja otworzy arkusz wgrywania
let pending: File | null = null
const subs = new Set<() => void>()
const set = (f: File | null) => {
  pending = f
  for (const s of subs) s()
}

/** W `MobileApp`: plik z innej aplikacji → ekran Ja z arkuszem „Wgraj jazdę (FIT)”. */
export function useSharedFitListener(): void {
  const navigate = useNavigate()
  const toast = useToast()
  // słuchacz rejestrowany raz: nowe `navigate`/`toast` po każdej nawigacji odpinałyby go i przypinały od nowa,
  // a plik przysłany w tej chwili mógłby przepaść
  const deps = useRef({ navigate, toast })
  useEffect(() => {
    deps.current = { navigate, toast }
  })
  useEffect(
    () =>
      onSharedFit((r) => {
        if ('error' in r) {
          const tr = t().m.me.rides
          deps.current.toast.notify(tr.fitShareFailed, 'error', r.error ?? tr.fitReadError)
          return
        }
        set(r.file)
        deps.current.navigate('/m/ja')
      }),
    [],
  )
}

/** Plik czekający na wgranie i funkcja, która go zabiera (arkusz bierze go raz). */
export function useSharedFit(): [File | null, () => void] {
  const file = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => pending,
  )
  return [file, () => set(null)]
}
