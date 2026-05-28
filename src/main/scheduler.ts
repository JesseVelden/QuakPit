import { getPrefs } from './store'
import { listUpcoming, type UpcomingEvent } from './calendar'
import { flyAcross } from './windows/overlay'

let pollTimer: NodeJS.Timeout | null = null
let tickTimer: NodeJS.Timeout | null = null
let upcoming: UpcomingEvent[] = []
const fired = new Set<string>()

const POLL_MS = 60_000 // refresh the event window every minute
const TICK_MS = 15_000 // check trigger times every 15s
const FIRE_WINDOW_MS = 90_000 // fire within 90s after the trigger time

export function startScheduler(): void {
  stopScheduler()
  void refresh()
  pollTimer = setInterval(() => void refresh(), POLL_MS)
  tickTimer = setInterval(tick, TICK_MS)
}

export function stopScheduler(): void {
  if (pollTimer) clearInterval(pollTimer)
  if (tickTimer) clearInterval(tickTimer)
  pollTimer = null
  tickTimer = null
}

export function getUpcoming(): UpcomingEvent[] {
  return upcoming
}

async function refresh(): Promise<void> {
  try {
    upcoming = await listUpcoming(60)
    // Forget fired markers for events that are no longer upcoming. Event ids can
    // themselves contain ':' (e.g. "ical:abc"), so match by id prefix, not split.
    const idList = upcoming.map((e) => e.id)
    for (const key of fired) {
      if (!idList.some((id) => key.startsWith(`${id}:`))) fired.delete(key)
    }
  } catch {
    /* offline / not connected — keep last known list */
  }
}

function tick(): void {
  const prefs = getPrefs()
  const now = Date.now()
  const lead = prefs.leadMinutes * 60_000
  // A second fly-by right at the meeting's start time (free).
  const flyAtStart = prefs.flyAtStart
  const skipTentative = prefs.skipTentative

  for (const ev of upcoming) {
    if (skipTentative && ev.tentative) continue

    // 1) The lead-time reminder (e.g. "Call with Jack in 5 minutes").
    const triggerAt = ev.start - lead
    const leadKey = `${ev.id}:${prefs.leadMinutes}`
    const leadDue = now >= triggerAt && now < triggerAt + FIRE_WINDOW_MS
    if (leadDue && ev.start > now && !fired.has(leadKey)) {
      const minutes = Math.max(1, Math.round((ev.start - now) / 60_000))
      const message = prefs.messageTemplate
        .replaceAll('{title}', ev.title)
        .replaceAll('{minutes}', String(minutes))
      if (flyAcross({ message, durationMs: 9000, sound: prefs.soundEnabled })) fired.add(leadKey)
    }

    // 2) Optional second fly-by right at the start time ("… starting now").
    if (flyAtStart) {
      const startKey = `${ev.id}:start`
      const startDue = now >= ev.start && now < ev.start + FIRE_WINDOW_MS
      if (startDue && !fired.has(startKey)) {
        if (
          flyAcross({
            message: `${ev.title} starting now`,
            durationMs: 9000,
            sound: prefs.soundEnabled
          })
        ) {
          fired.add(startKey)
        }
      }
    }
  }
}
