import type pl from '../pl/coach'

const en: typeof pl = {
  title: 'Coach',
  tools: {
    save_checkin: 'saving your check-in',
    set_rpe: 'saving RPE',
    mark_skipped: 'marking as skipped',
    move_ride: 'moving a workout',
    push_wahoo: 'sending to Bolt',
  },
  changed: {
    checkin: 'Check-in saved',
    log: 'RPE saved',
    plan: 'Plan updated',
    bolt: 'Sent to Bolt',
  },
  savedFallback: 'Saved',
  reading: 'Coach is reading…',
  running: (what: string) => `Working: ${what}…`,
  replying: 'Coach is replying…',
  noReply: (reason: string) => `The coach didn’t reply. ${reason}`,
  clearTitle: 'Clear the conversation with your coach?',
  clearMessage: 'The history can’t be restored. Saved data (check-ins, RPE, moved workouts) stays.',
  clear: 'Clear',
  needsAccount: 'Chat needs an account – the app is running locally.',
  intro: 'I can see your plan, recent rides and check-ins. Tell me your numbers in a sentence and I’ll save them. You can also ask about the plan or have me move a workout.',
  stop: 'Stop',
  placeholder: 'Type or dictate…',
  inputAria: 'Message to your coach',
  send: 'Send',
}

export default en
