import type pl from '../pl/login'

const en: typeof pl = {
  withGoogle: 'Sign in with Google',
  withStrava: 'Sign in with Strava',
  skip: 'Skip',
  lead: 'Your cycling coach: today’s workout, your Strava rides and your Bolt in one place.',
  orCode: 'or use a code from your email',
  emailPlaceholder: 'Your email',
  emailLabel: 'Email address',
  sendCode: 'Send code',
  sendingCode: 'Sending code…',
  signingIn: 'Signing in…',
  codeSentBefore: 'We sent a code to',
  codeSentAfter: '.',
  codeLabel: (n: number) => `${n}-digit code from the email`,
  signIn: 'Sign in',
  resend: 'Didn’t get it? Send again',
  linkLabel: 'Link from the email',
  linkHint: 'Copy the full link from the email and paste it here.',
  signInWithLink: 'Sign in with link',
  backToCode: 'Use a code instead',
  haveLink: 'I have a link from the email',
  noAccountNote: 'Without an account you’ll only see the plan – rides, check-ins and changes stay on this phone.',
}

export default en
