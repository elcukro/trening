import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { onSharedFit } from '@/native'
import { useToast } from '@/components/Toast'

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
  useEffect(
    () =>
      onSharedFit((r) => {
        if ('error' in r) {
          toast.notify('Nie wgrano jazdy', 'error', r.error)
          return
        }
        set(r.file)
        navigate('/m/ja')
      }),
    [navigate, toast],
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
