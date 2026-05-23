import * as google from './google'
import * as icloud from './icloud'
import * as ical from './ical'
import type { ProviderStatus, UpcomingEvent } from './types'

export type { ProviderStatus, UpcomingEvent } from './types'
export type { Feed } from './ical'

/** Restore any saved provider sessions (no UI, best-effort). */
export async function init(): Promise<void> {
  await google.init().catch(() => undefined)
  icloud.init()
  ical.init()
}

export function statuses(): ProviderStatus[] {
  const g = google.status()
  return [
    ical.status(),
    {
      id: 'google',
      name: 'Google Calendar',
      connected: g.connected,
      detail: g.email,
      configured: g.configured
    },
    icloud.status()
  ]
}

// iCal subscription links (add as many calendar URLs as you like).
export const icalFeeds = (): ical.Feed[] => ical.listFeeds()
export const icalAdd = (url: string, name?: string): Promise<ical.Feed[]> => ical.addFeed(url, name)
export const icalRemove = (id: string): ical.Feed[] => ical.removeFeed(id)

/** Merged, de-duplicated, sorted events from every connected provider. */
export async function listUpcoming(minutes = 60): Promise<UpcomingEvent[]> {
  const [g, i, c] = await Promise.all([
    google
      .listUpcoming(minutes)
      .then((es) => es.map((e) => ({ ...e, id: `google:${e.id}` })))
      .catch(() => [] as UpcomingEvent[]),
    icloud.listUpcoming(minutes).catch(() => [] as UpcomingEvent[]),
    ical.listUpcoming(minutes).catch(() => [] as UpcomingEvent[])
  ])

  const seen = new Set<string>()
  const out: UpcomingEvent[] = []
  for (const e of [...g, ...i, ...c].sort((a, b) => a.start - b.start)) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
  }
  return out
}

export async function connect(
  provider: string,
  params: { username?: string; password?: string }
): Promise<ProviderStatus[]> {
  if (provider === 'google') await google.connect()
  else if (provider === 'icloud') await icloud.connect(params.username ?? '', params.password ?? '')
  else throw new Error(`Unknown provider: ${provider}`)
  return statuses()
}

export function disconnect(provider: string): ProviderStatus[] {
  if (provider === 'google') google.disconnect()
  else if (provider === 'icloud') icloud.disconnect()
  return statuses()
}

/** Provider setup that isn't a sign-in (e.g. pasting Google's client id/secret). */
export function configure(
  provider: string,
  params: { clientId?: string; clientSecret?: string }
): ProviderStatus[] {
  if (provider === 'google') google.setCreds(params.clientId ?? '', params.clientSecret ?? '')
  else throw new Error(`Cannot configure provider: ${provider}`)
  return statuses()
}
