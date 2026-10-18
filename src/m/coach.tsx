import { createContext, useContext } from 'react'

/** Otwieranie arkusza Trener z dowolnego ekranu `/m` (przycisk na pasku i działania kart) – dostarcza `MobileApp`. */
export const CoachContext = createContext<{ open: (prefill?: string) => void }>({ open: () => {} })

export function useOpenCoach(): (prefill?: string) => void {
  return useContext(CoachContext).open
}
