import type pl from '../pl/errors'

const en: typeof pl = {
  offline: 'No internet connection. Check your network and try again.',
  timeout: 'The server is taking too long to respond. Try again in a moment.',
  session: 'Your session has expired. Sign in again – the data on your phone stays.',
  rateLimit: 'Too many attempts at once. Wait a few minutes and try again.',
  server: 'The server is having a temporary problem. Try again in a few minutes.',
  unknown: 'Something went wrong. Try again in a moment.',
  retry: 'Retry',
}

export default en
