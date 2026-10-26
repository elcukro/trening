/**
 * Błąd akcji po ludzku (docs/27 § 6): co się stało i co zrobić, po polsku, bez kodów. Komunikaty z naszego kodu są
 * już po polsku i zostają; techniczne (fetch, Supabase, HTTP) zamieniamy na zdanie z radą, a oryginał idzie do `detail`.
 */
export interface FriendlyError {
  /** jedno–dwa zdania dla zawodnika */
  message: string
  /** czy ponowienie tej samej akcji ma sens (sieć, przekroczony czas, chwilowy błąd serwera) */
  retry: boolean
  /** surowy komunikat – tylko gdy `message` go zastępuje */
  detail?: string
}

const NETWORK = /failed to fetch|load failed|networkerror|network request failed|err_internet|err_network|fetcherror|the internet connection appears to be offline|could not connect/i
const TIMEOUT = /przekroczono czas|timed? ?out|aborterror|deadline/i
const AUTH = /\b401\b|jwt|auth session missing|refresh token|not authenticated|sesja wygasła|invalid claim/i
const RATE = /\b429\b|rate limit|too many requests/i
const SERVER = /\b50[0-4]\b|internal server error|bad gateway|service unavailable/i
/** słowa typowe dla angielskich komunikatów bibliotek – wtedy nie pokazujemy ich zawodnikowi wprost */
const ENGLISH = /\b(error|failed|invalid|unable|unexpected|cannot|undefined|null|status|request|response|not found|denied)\b/i
const POLISH = /[ąćęłńóśźż]|\b(nie|brak|się|jest|na|wymaga)\b/i

export function friendlyError(e: unknown, online = typeof navigator === 'undefined' || navigator.onLine !== false): FriendlyError {
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim()
  if (!online || NETWORK.test(raw)) return { message: 'Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.', retry: true, detail: raw || undefined }
  if (TIMEOUT.test(raw)) return { message: 'Serwer długo nie odpowiada. Spróbuj ponownie za chwilę.', retry: true, detail: raw }
  if (AUTH.test(raw)) return { message: 'Sesja wygasła. Zaloguj się ponownie – dane na telefonie zostają.', retry: false, detail: raw }
  if (RATE.test(raw)) return { message: 'Za dużo prób naraz. Odczekaj kilka minut i spróbuj ponownie.', retry: false, detail: raw }
  if (SERVER.test(raw)) return { message: 'Serwer ma chwilowy problem. Spróbuj ponownie za kilka minut.', retry: true, detail: raw }
  if (raw && POLISH.test(raw) && !ENGLISH.test(raw)) return { message: raw, retry: false }
  return { message: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.', retry: true, detail: raw || undefined }
}
