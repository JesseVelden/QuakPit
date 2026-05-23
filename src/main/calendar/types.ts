// Shared calendar types across providers (Google, iCloud, ...).
export type UpcomingEvent = { id: string; title: string; start: number }

export type ProviderStatus = {
  id: string // 'google' | 'icloud'
  name: string
  connected: boolean
  detail: string | null // e.g. the connected email / Apple ID
  configured: boolean // whether the provider is usable (e.g. Google creds present)
}
