import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { getLang, resolveLang, setLang, subscribeLang, type Lang } from './core'
import { t, type Messages } from './index'

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang)
}

/** Teksty w bieżącym języku: `const t = useT(); t.m.today.title`. */
export function useT(): Messages {
  return t(useLang())
}

/**
 * Ustawia język z wyboru zawodnika (`settings.language`) i przemontowuje drzewo po zmianie, żeby formatery
 * i etykiety czytane poza React (`num`, `DAY_TYPE_LABEL`) też przeszły na nowy język.
 */
export function LangProvider({ choice, children }: { choice: string | null | undefined; children: ReactNode }) {
  const lang = useLang()
  const wanted = resolveLang(choice)
  useEffect(() => {
    if (wanted !== getLang()) setLang(wanted)
  }, [wanted])
  useEffect(() => {
    const onChange = () => {
      if (!choice || choice === 'system') setLang(resolveLang(choice))
    }
    window.addEventListener('languagechange', onChange)
    return () => window.removeEventListener('languagechange', onChange)
  }, [choice])
  return <Fragment key={lang}>{children}</Fragment>
}
