import ICAL from 'ical.js'
import { clearICloud, loadICloud, saveICloud } from '../store'
import type { ProviderStatus, UpcomingEvent } from './types'

const ROOT = 'https://caldav.icloud.com'

type Creds = { username: string; password: string }
type Cal = { url: string; name: string }

let creds: Creds | null | undefined // undefined = not loaded yet
let calendars: Cal[] | null = null // discovered, cached in memory

function loadCreds(): void {
  if (creds !== undefined) return
  const raw = loadICloud()
  try {
    creds = raw ? (JSON.parse(raw) as Creds) : null
  } catch {
    creds = null
  }
}

function authHeader(c: Creds): string {
  return 'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64')
}

async function dav(url: string, method: string, body: string, depth = '0'): Promise<string> {
  if (!creds) throw new Error('iCloud not connected')
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(creds),
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth
    },
    body,
    redirect: 'follow'
  })
  if (res.status === 401) throw new Error('Wrong Apple ID or app-specific password.')
  if (res.status !== 207 && !res.ok) throw new Error(`iCloud CalDAV error (${res.status})`)
  return res.text()
}

/** First <href> inside the first <tag>…</tag> (namespace-agnostic). */
function hrefInside(xml: string, tag: string): string | null {
  const block = new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)</[^>]*${tag}>`, 'i').exec(xml)
  if (!block) return null
  const href = /<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i.exec(block[1])
  return href ? href[1].trim() : null
}

async function discover(): Promise<Cal[]> {
  if (calendars) return calendars
  loadCreds()
  if (!creds) throw new Error('iCloud not connected')

  const principalXml = await dav(
    ROOT,
    'PROPFIND',
    `<?xml version="1.0"?><A:propfind xmlns:A="DAV:"><A:prop><A:current-user-principal/></A:prop></A:propfind>`,
    '0'
  )
  const principal = hrefInside(principalXml, 'current-user-principal')
  if (!principal) throw new Error('Could not find your iCloud account.')
  const principalUrl = new URL(principal, ROOT).toString()

  const homeXml = await dav(
    principalUrl,
    'PROPFIND',
    `<?xml version="1.0"?><A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><A:prop><C:calendar-home-set/></A:prop></A:propfind>`,
    '0'
  )
  const home = hrefInside(homeXml, 'calendar-home-set')
  if (!home) throw new Error('Could not find your iCloud calendars.')
  const homeUrl = new URL(home, principalUrl).toString()

  const listXml = await dav(
    homeUrl,
    'PROPFIND',
    `<?xml version="1.0"?><A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><A:prop><A:displayname/><A:resourcetype/><C:supported-calendar-component-set/></A:prop></A:propfind>`,
    '1'
  )

  const cals: Cal[] = []
  for (const block of listXml.split(/<[^>]*:?response[ >]/i).slice(1)) {
    const rt = /<[^>]*resourcetype[^>]*>([\s\S]*?)<\/[^>]*resourcetype>/i.exec(block)
    const isCalendar = rt ? /calendar/i.test(rt[1]) : false
    if (!isCalendar) continue
    if (!/VEVENT/i.test(block)) continue // skip reminder/task lists
    const href = /<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i.exec(block)
    if (!href) continue
    const name = /<[^>]*displayname[^>]*>([^<]*)<\/[^>]*displayname>/i.exec(block)
    cals.push({
      url: new URL(href[1].trim(), homeUrl).toString(),
      name: (name?.[1] ?? 'Calendar').trim()
    })
  }
  calendars = cals
  return cals
}

const toCalDav = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&amp;/g, '&')
}

function parseIcs(ics: string, out: UpcomingEvent[]): void {
  try {
    const comp = new ICAL.Component(ICAL.parse(ics))
    for (const ve of comp.getAllSubcomponents('vevent')) {
      const ev = new ICAL.Event(ve)
      if (!ev.startDate || ev.startDate.isDate) continue // skip all-day
      const start = ev.startDate.toJSDate().getTime()
      out.push({
        id: `icloud:${ev.uid || ''}:${start}`,
        title: ev.summary || 'Untitled event',
        start
      })
    }
  } catch {
    /* ignore malformed ICS */
  }
}

// --- public API ------------------------------------------------------------

export function init(): void {
  loadCreds()
}

export function status(): ProviderStatus {
  loadCreds()
  return {
    id: 'icloud',
    name: 'iCloud',
    connected: !!creds,
    detail: creds?.username ?? null,
    configured: true
  }
}

export async function connect(username: string, password: string): Promise<void> {
  creds = { username: username.trim(), password: password.trim() }
  calendars = null
  if (!creds.username || !creds.password) {
    creds = null
    throw new Error('Enter your Apple ID and an app-specific password.')
  }
  try {
    await discover() // validates the credentials (401 if wrong)
  } catch (e) {
    creds = null
    throw e
  }
  saveICloud(JSON.stringify(creds))
}

export function disconnect(): void {
  creds = null
  calendars = null
  clearICloud()
}

/** Events starting within the next `minutes`. In memory only, never persisted. */
export async function listUpcoming(minutes = 60): Promise<UpcomingEvent[]> {
  loadCreds()
  if (!creds) return []
  const cals = await discover()
  const now = new Date()
  const end = new Date(now.getTime() + minutes * 60_000)
  const startStr = toCalDav(now)
  const endStr = toCalDav(end)

  const body = `<?xml version="1.0"?><C:calendar-query xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><A:prop><C:calendar-data><C:expand start="${startStr}" end="${endStr}"/></C:calendar-data></A:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${startStr}" end="${endStr}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`

  const events: UpcomingEvent[] = []
  await Promise.all(
    cals.map(async (cal) => {
      try {
        const xml = await dav(cal.url, 'REPORT', body, '1')
        const re = /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(xml))) parseIcs(decodeEntities(m[1]), events)
      } catch {
        /* skip this calendar */
      }
    })
  )

  const nowMs = Date.now()
  const endMs = end.getTime()
  return events.filter((e) => e.start > nowMs && e.start <= endMs).sort((a, b) => a.start - b.start)
}
