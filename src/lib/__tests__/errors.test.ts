import { describe, expect, it } from 'vitest'
import { friendlyError } from '../errors'

describe('friendlyError', () => {
  it('brak sieci – rada i ponowienie', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatchObject({ retry: true, message: expect.stringContaining('internetem') })
    expect(friendlyError(new TypeError('Load failed'))).toMatchObject({ retry: true })
    expect(friendlyError(new Error('Wahoo nie jest połączone.'), false).message).toContain('internetem')
  })
  it('przekroczony czas, sesja, limit, serwer', () => {
    expect(friendlyError(new Error('Przekroczono czas oczekiwania (60 s).'))).toMatchObject({ retry: true, message: expect.stringContaining('nie odpowiada') })
    expect(friendlyError(new Error('JWT expired'))).toMatchObject({ retry: false, message: expect.stringContaining('Sesja wygasła') })
    expect(friendlyError(new Error('wahoo 429'))).toMatchObject({ retry: false, message: expect.stringContaining('Odczekaj') })
    expect(friendlyError(new Error('Edge Function returned 502 Bad Gateway'))).toMatchObject({ retry: true, message: expect.stringContaining('Serwer') })
  })
  it('polski komunikat z naszego kodu zostaje bez zmian', () => {
    expect(friendlyError(new Error('Wysyłka wymaga konta.'))).toEqual({ message: 'Wysyłka wymaga konta.', retry: false })
  })
  it('angielski komunikat biblioteki – zdanie ogólne, oryginał w detail', () => {
    const r = friendlyError(new Error('Unexpected token < in JSON'))
    expect(r.message).toBe('Coś poszło nie tak. Spróbuj ponownie za chwilę.')
    expect(r.detail).toBe('Unexpected token < in JSON')
  })
})
