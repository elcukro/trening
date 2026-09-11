/** Wyciąga `token_hash` i typ z linku logowania Supabase (…/auth/v1/verify?token=…&type=magiclink&redirect_to=…). */
export function parseMagicLink(input: string): { token_hash: string; type: 'magiclink' | 'email' | 'signup' | 'recovery' } | null {
  const m = /https?:\/\/\S+/.exec(input.trim())
  if (!m) return null
  let url: URL
  try {
    url = new URL(m[0])
  } catch {
    return null
  }
  const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') ?? 'magiclink'
  if (!token || !/^(magiclink|email|signup|recovery)$/.test(type)) return null
  return { token_hash: token, type: type as 'magiclink' | 'email' | 'signup' | 'recovery' }
}

/** Błąd logowania przekazany w URL po powrocie z maila (np. link wygasł). */
export function authErrorFromLocation(loc: { hash: string; search: string }): string | null {
  const params = new URLSearchParams(loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.search)
  const desc = params.get('error_description') ?? params.get('error')
  if (!desc) return null
  const d = decodeURIComponent(desc.replace(/\+/g, ' '))
  if (/expired|invalid/i.test(d)) return 'Link wygasł lub został już użyty – wyślij nowy.'
  return d
}
