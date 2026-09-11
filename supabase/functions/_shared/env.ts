export function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Brak zmiennej środowiskowej ${name}`)
  return v
}

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://trening-inky.vercel.app'

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } })
}

export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
