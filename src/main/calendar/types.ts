// Shared calendar types across providers (Google, iCloud, ...).
export type UpcomingEvent = { id: string; title: string; start: number; tentative?: boolean }

export type ProviderStatus = {
  id: string // 'google' | 'icloud' | 'ical' | 'outlook'
  name: string
  connected: boolean
  detail: string | null // e.g. the connected email / Apple ID
  configured: boolean // whether the provider is usable (e.g. Google creds present)
}
