import { createHash } from 'node:crypto'
import os from 'node:os'
import { machineIdSync } from 'node-machine-id'
import { clearEntitlement, loadEntitlement, saveEntitlement } from './store'

// Polar (Merchant of Record). The customer-portal license-key endpoints are
// PUBLIC — no secret token — so they're safe to call from the app. We only ever
// verify the single key the user pastes; we never list or store other keys.
//
// SANDBOX = true → test against Polar's isolated sandbox (free, card 4242…).
// Keep this flag in sync with SANDBOX in settings.ts (checkout URL).
const SANDBOX = false
const API = SANDBOX ? 'https://sandbox-api.polar.sh/v1' : 'https://api.polar.sh/v1'
const ORG_ID = SANDBOX
  ? '6a03d434-99bb-4df4-8f43-123fc8d465c8' // sandbox org
  : '89924512-c86b-43a8-920a-86d01e84f5e1'
// Premium keeps working offline this long after the last successful validation.
const GRACE_MS = 14 * 24 * 60 * 60 * 1000

export type LicenseStatus = {
  premium: boolean
  active: boolean
  keyMasked: string | null
  expiresAt: number | null
  lastChecked: number | null
}

type Entitlement = {
  key: string
  instanceId: string // Polar activation id
  status: string // granted | revoked | disabled
  validatedAt: number
  expiresAt: number | null
}

let ent: Entitlement | null | undefined // undefined = not loaded yet

function loadCache(): void {
  if (ent !== undefined) return
  const raw = loadEntitlement()
  try {
    ent = raw ? (JSON.parse(raw) as Entitlement) : null
  } catch {
    ent = null
  }
}

function persist(): void {
  if (ent) saveEntitlement(JSON.stringify(ent))
}

/** Stable, anonymised per-machine id used as the activation label. */
function deviceId(): string {
  let base: string
  try {
    base = machineIdSync(true)
  } catch {
    base = `${os.hostname()}|${os.platform()}|${os.arch()}`
  }
  return 'quakpit-' + createHash('sha256').update(base).digest('hex').slice(0, 24)
}

function maskKey(k: string): string {
  return k.length <= 8 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`
}

async function polarPost(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; code: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, code: res.status, json }
}

function parseExpiry(v: unknown): number | null {
  return typeof v === 'string' ? new Date(v).getTime() : null
}

export function isPremium(): boolean {
  loadCache()
  if (!ent) return false
  const now = Date.now()
  const statusOk = ent.status === 'granted'
  const notExpired = ent.expiresAt == null || now < ent.expiresAt
  const withinGrace = now - ent.validatedAt < GRACE_MS
  return statusOk && notExpired && withinGrace
}

export function status(): LicenseStatus {
  loadCache()
  return {
    premium: isPremium(),
    active: !!ent && ent.status === 'granted',
    keyMasked: ent ? maskKey(ent.key) : null,
    expiresAt: ent?.expiresAt ?? null,
    lastChecked: ent?.validatedAt ?? null
  }
}

/** Binds the key to this device (Polar activation limit enforces 1 device). */
export async function activate(key: string): Promise<LicenseStatus> {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('Please enter a license key.')

  const { ok, code, json } = await polarPost('/customer-portal/license-keys/activate', {
    key: trimmed,
    organization_id: ORG_ID,
    label: deviceId()
  })
  if (!ok || !json?.id) {
    const detail = typeof json?.detail === 'string' ? json.detail : null
    throw new Error(
      detail ??
        (code === 404
          ? 'Invalid license key.'
          : 'Activation failed — the key may already be active on another device.')
    )
  }

  const lk = json.license_key ?? {}
  ent = {
    key: trimmed,
    instanceId: json.id,
    status: lk.status ?? 'granted',
    validatedAt: Date.now(),
    expiresAt: parseExpiry(lk.expires_at)
  }
  persist()
  return status()
}

/** Re-checks the license online; on network failure keeps the cache (offline grace). */
export async function validate(): Promise<LicenseStatus> {
  loadCache()
  if (!ent) return status()
  try {
    const { ok, code, json } = await polarPost('/customer-portal/license-keys/validate', {
      key: ent.key,
      organization_id: ORG_ID,
      ...(ent.instanceId ? { activation_id: ent.instanceId } : {})
    })
    if (ok && json) {
      ent = {
        ...ent,
        status: json.status ?? ent.status,
        validatedAt: Date.now(),
        expiresAt: parseExpiry(json.expires_at) ?? ent.expiresAt
      }
      persist()
    } else if (code === 404 || code === 403) {
      // Key/activation no longer valid (revoked, deleted, subscription canceled).
      ent = { ...ent, status: 'revoked', validatedAt: Date.now() }
      persist()
    }
  } catch {
    // Offline — keep the cached entitlement; the grace window covers this.
  }
  return status()
}

/** Releases the seat so the key can be activated on another device. */
export async function deactivate(): Promise<LicenseStatus> {
  loadCache()
  if (ent && ent.instanceId) {
    try {
      await polarPost('/customer-portal/license-keys/deactivate', {
        key: ent.key,
        organization_id: ORG_ID,
        activation_id: ent.instanceId
      })
    } catch {
      /* best effort — clear locally anyway */
    }
  }
  ent = null
  clearEntitlement()
  return status()
}
