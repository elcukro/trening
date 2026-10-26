import { getLang } from '@/i18n/core'

/** Instrukcja użytkownika – statyczna strona poza routerem SPA (docs/22): po angielsku `/help.html`, inaczej `/pomoc.html`. */
export function helpUrl(): string {
  return getLang() === 'en' ? '/help.html' : '/pomoc.html'
}
