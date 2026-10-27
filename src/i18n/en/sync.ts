import type pl from '../pl/sync'

const en: typeof pl = {
  noBackend: 'This version of the app has no server connection – sign-in and integrations are turned off.',
  timeout: (s: number) => `The server didn’t respond within ${s} s – please try again.`,
  noReply: 'The server sent no response – please try again.',
  fn: {
    unauthorized: 'Sign in (Settings → Account) to use integrations.',
    notConnected: 'This integration isn’t connected – connect it in Settings → Integrations.',
    noItems: 'There are no workouts to send for this period.',
    unknownAction: 'The server didn’t recognise the request – update the app, and report the problem if that doesn’t help.',
    method: 'The server doesn’t support this request – update the app.',
  },
  auth: {
    notAllowed: 'This email address doesn’t have access to the app.',
    notAllowedHint: 'This email address doesn’t have access to the app. Sign in with an address that’s on the allowed list.',
    rateLimit: 'Too many attempts – wait a minute and try again.',
    signupsDisabled: 'Sign-ups are closed – this address isn’t on the allowed list.',
    codeExpired: 'The code or link has expired or was already used (each works once) – request a new one.',
    linkExpired: 'The link has expired or was already used – request a new one.',
    notMagicLink: 'That doesn’t look like a sign-in link from the email.',
    codeLength: (n: number) => `The code has ${n} digits.`,
    canceled: 'Sign-in was cancelled.',
    googleDisabled: 'Sign-in with Google isn’t available yet.',
    storageBlocked: 'Your browser is blocking site storage (private window?) – sign in with the code from the email.',
    stravaOtherWindow: 'Strava sign-in started in another window – please try again.',
    stravaFailed: 'Strava sign-in didn’t work – please try again.',
    strava: {
      notLinked:
        'This Strava account isn’t linked to any account in the app. Sign in with the code from the email, then connect Strava in Settings → Integrations (full app in a browser).',
      denied: 'Strava sign-in was cancelled.',
      expired: 'Strava sign-in took too long – please try again.',
      badState: 'Strava sign-in didn’t work – please try again.',
      server: 'Strava didn’t respond properly – try again shortly or sign in with the code from the email.',
    },
  },
  coach: {
    sessionExpired: 'Your session has expired – please sign in again.',
    noReply: 'The coach isn’t responding – try again shortly.',
    noReplyStatus: (status: number) => `The coach isn’t responding (error ${status}) – try again shortly.`,
    noAccount: 'Chatting with the coach needs an account – please sign in.',
    offline: 'Can’t reach the coach – check your connection and send again.',
  },
  parse: {
    noAccount: 'Recognition needs an account – please sign in.',
  },
  push: {
    notSubscribed: 'This device isn’t signed up for notifications.',
    signIn: 'Sign in (Settings → Account) to turn on notifications.',
    unsupported: 'This browser doesn’t support notifications.',
    iosHomeScreen: 'On iPhone, add the app to your Home Screen and turn on notifications from there.',
    denied: 'Notifications are blocked – allow them in your browser or phone settings.',
    unsubscribeFailed: (msg: string) => `Couldn’t remove this device on the server (${msg}) – try again when you’re online.`,
    deviceFallback: 'device',
    testText: 'Notifications are working. This is how your daily plan will look.',
  },
  wahoo: {
    sending: 'sending…',
    partial: (ok: number, errors: number) => `${ok} sent, ${errors} failed`,
    sent: (n: number) => `${n} sent`,
    failed: (msg: string) => `error: ${msg}`,
  },
  location: {
    denied: (app: string) => `No location permission. Turn it on in iPhone Settings → ${app} → Location (“While Using the App”).`,
    failed: 'Couldn’t determine your location. Try outdoors or enter a town.',
  },
}

export default en
