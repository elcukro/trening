/**
 * Zdjęcie profilowe na ekranie Ja: własne (data URL w profilu, `settings.avatar`) → zdjęcie z konta Google
 * (`user_metadata.avatar_url`) → inicjały. `avatar = 'none'` to świadomy wybór inicjałów zamiast zdjęcia z Google.
 * Apple nie udostępnia zdjęcia Apple ID innym aplikacjom; zdjęcia ze Stravy nie bierzemy (dane Stravy żyją 7 dni, docs/33).
 */

export const AVATAR_PX = 240
export const AVATAR_NONE = 'none'

export type AvatarView = { kind: 'photo'; src: string; source: 'own' | 'google' } | { kind: 'initials'; text: string }

/** Zdjęcie Google w większym rozmiarze: adresy lh3.googleusercontent.com kończą się `=s96-c`. */
export function googleAvatarUrl(meta: Record<string, unknown> | undefined): string | null {
  const url = meta?.avatar_url ?? meta?.picture
  if (typeof url !== 'string' || !url.startsWith('https://')) return null
  return url.replace(/=s\d+-c$/, `=s${AVATAR_PX}-c`)
}

export function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length > 0) return words.slice(0, 2).map((w) => w[0]!.toLocaleUpperCase()).join('')
  const first = (email ?? '').trim()[0]
  return first ? first.toLocaleUpperCase() : '?'
}

export function avatarView(own: string | null | undefined, google: string | null, name: string | null | undefined, email: string | null | undefined): AvatarView {
  if (own && own !== AVATAR_NONE) return { kind: 'photo', src: own, source: 'own' }
  if (google && own !== AVATAR_NONE) return { kind: 'photo', src: google, source: 'google' }
  return { kind: 'initials', text: initialsOf(name, email) }
}

/** Zdjęcie z galerii → kwadrat ze środka, JPEG 240 px (~20–40 kB) jako data URL. Oryginał nigdzie nie trafia. */
export async function squarePhoto(file: Blob, px = AVATAR_PX, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, px, px)
  bmp.close()
  return canvas.toDataURL('image/jpeg', quality)
}
