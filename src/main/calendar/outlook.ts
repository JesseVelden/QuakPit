import { spawn } from 'node:child_process'
import {
  clearOutlookSelection,
  loadOutlookSelection,
  saveOutlookSelection
} from '../store'
import type { ProviderStatus, UpcomingEvent } from './types'

type PowerShellEvent = {
  id?: string
  title?: string
  start?: string
  busyStatus?: number
}

export type OutlookFolder = {
  id: string
  storeId: string
  folderId: string
  storeName: string
  name: string
  path: string
}

type SavedSelection = {
  storeId: string
  folderId: string
  storeName: string
  name: string
  path: string
}

let selected: SavedSelection | null = null

const WINDOWS_ONLY_MSG = 'Classic Outlook is available only on Windows.'
const PS_NAME = 'powershell.exe'

const LIST_FOLDERS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'

try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  throw 'Classic Outlook is not installed.'
}

$namespace = $outlook.GetNamespace('MAPI')
if (-not $namespace) {
  throw 'Classic Outlook is not configured.'
}

$results = New-Object System.Collections.Generic.List[object]
$olFolderCalendar = 9

function Add-CalendarFolders {
  param(
    [Parameter(Mandatory = $true)] $Folder,
    [Parameter(Mandatory = $true)][string] $StoreName,
    [AllowEmptyString()][string] $Prefix = ''
  )

  $currentPath = if ([string]::IsNullOrWhiteSpace($Prefix)) { $Folder.Name } else { "$Prefix / $($Folder.Name)" }

  try {
    if ($Folder.DefaultItemType -eq 1) {
      $folderId = [string]$Folder.EntryID
      $storeId = [string]$Folder.StoreID
      if (-not [string]::IsNullOrWhiteSpace($folderId) -and -not [string]::IsNullOrWhiteSpace($storeId)) {
        $results.Add([pscustomobject]@{
          id = "$storeId::$folderId"
          storeId = $storeId
          folderId = $folderId
          storeName = $StoreName
          name = [string]$Folder.Name
          path = $currentPath
        }) | Out-Null
      }
    }
  } catch {
    # ignore non-calendar folders that fail inspection
  }

  foreach ($child in $Folder.Folders) {
    Add-CalendarFolders -Folder $child -StoreName $StoreName -Prefix $currentPath
  }
}

foreach ($store in $namespace.Stores) {
  try {
    $calendarRoot = $store.GetDefaultFolder($olFolderCalendar)
    if ($calendarRoot) {
      Add-CalendarFolders -Folder $calendarRoot -StoreName ([string]$store.DisplayName) -Prefix ''
    }
  } catch {
    # skip stores without a calendar default folder
  }
}

$results | ConvertTo-Json -Compress
`

const LIST_EVENTS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'

function Get-OutlookDateFilter {
  param([Parameter(Mandatory = $true)][datetime]$Date)

  return $Date.ToString('g', [System.Globalization.CultureInfo]::CurrentCulture)
}

try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  throw 'Classic Outlook is not installed.'
}

$namespace = $outlook.GetNamespace('MAPI')
if (-not $namespace) {
  throw 'Classic Outlook is not configured.'
}

$folderId = [string]$payload.folderId
$storeId = [string]$payload.storeId
if ([string]::IsNullOrWhiteSpace($folderId) -or [string]::IsNullOrWhiteSpace($storeId)) {
  throw 'Choose an Outlook calendar folder first.'
}

try {
  $folder = $namespace.GetFolderFromID($folderId, $storeId)
} catch {
  throw 'The selected Outlook calendar could not be opened.'
}

if (-not $folder) {
  throw 'The selected Outlook calendar could not be opened.'
}

$start = [datetime]::Parse([string]$payload.start)
$end = [datetime]::Parse([string]$payload.end)

$items = $folder.Items
$items.Sort('[Start]')
$items.IncludeRecurrences = $true

$filter = "[Start] >= '$(Get-OutlookDateFilter $start)' AND [Start] <= '$(Get-OutlookDateFilter $end)'"
$filtered = $items.Restrict($filter)

$results = New-Object System.Collections.Generic.List[object]

foreach ($item in $filtered) {
  try {
    if ($item.Class -ne 26) { continue }
    if ($item.AllDayEvent) { continue }

    $eventStart = [datetime]$item.Start
    if ($eventStart -lt $start -or $eventStart -gt $end) { continue }

    $eventId = if (-not [string]::IsNullOrWhiteSpace([string]$item.GlobalAppointmentID)) {
      [string]$item.GlobalAppointmentID
    } elseif (-not [string]::IsNullOrWhiteSpace([string]$item.EntryID)) {
      [string]$item.EntryID
    } else {
      [string]$item.Subject
    }

    $results.Add([pscustomobject]@{
      id = "$storeId::$folderId::$eventId::$($eventStart.ToString('o'))"
      title = if ([string]::IsNullOrWhiteSpace([string]$item.Subject)) { 'Untitled event' } else { [string]$item.Subject }
      start = $eventStart.ToString('o')
      busyStatus = [int]$item.BusyStatus
    }) | Out-Null
  } catch {
    # skip malformed items
  }
}

$results | ConvertTo-Json -Compress
`

function isWindows(): boolean {
  return process.platform === 'win32'
}

function parseSelection(raw: string | null): SavedSelection | null {
  if (!raw) return null
  try {
    const json = JSON.parse(raw) as Partial<SavedSelection>
    if (
      json.storeId &&
      json.folderId &&
      json.storeName &&
      json.name &&
      json.path
    ) {
      return {
        storeId: json.storeId,
        folderId: json.folderId,
        storeName: json.storeName,
        name: json.name,
        path: json.path
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function serializeSelection(folder: OutlookFolder): SavedSelection {
  return {
    storeId: folder.storeId,
    folderId: folder.folderId,
    storeName: folder.storeName,
    name: folder.name,
    path: folder.path
  }
}

async function runPowerShell<T>(script: string, payload?: unknown): Promise<T> {
  if (!isWindows()) throw new Error(WINDOWS_ONLY_MSG)

  const payloadScript =
    payload === undefined
      ? ''
      : `$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(
          JSON.stringify(payload),
          'utf8'
        ).toString('base64')}'))\n$payload = $payloadJson | ConvertFrom-Json\n`
  const encoded = Buffer.from(`${payloadScript}${script}`, 'utf16le').toString('base64')

  return await new Promise<T>((resolve, reject) => {
    const child = spawn(
      PS_NAME,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      if ('code' in err && err.code === 'ENOENT') {
        reject(new Error('Windows PowerShell is not available.'))
        return
      }
      reject(err)
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(cleanPowerShellError(stderr) || 'Classic Outlook query failed.'))
        return
      }
      const raw = stdout.trim()
      if (!raw) {
        resolve([] as T)
        return
      }
      try {
        resolve(JSON.parse(raw) as T)
      } catch {
        reject(new Error('Classic Outlook returned unreadable data.'))
      }
    })
  })
}

function cleanPowerShellError(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part)
  if (!line) return ''
  return line.replace(/^.+?:\s*/, '')
}

function selectedDetail(): string | null {
  if (!selected) return null
  return `${selected.storeName} - ${selected.path}`
}

export function init(): void {
  selected = parseSelection(loadOutlookSelection())
}

export function status(): ProviderStatus {
  return {
    id: 'outlook',
    name: 'Outlook (classic)',
    connected: selected !== null,
    detail: isWindows() ? selectedDetail() : 'Windows only',
    configured: isWindows()
  }
}

export async function listFolders(): Promise<OutlookFolder[]> {
  const raw = await runPowerShell<OutlookFolder[] | OutlookFolder>(LIST_FOLDERS_SCRIPT)
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.filter(
    (folder): folder is OutlookFolder =>
      Boolean(
        folder &&
          folder.id &&
          folder.storeId &&
          folder.folderId &&
          folder.storeName &&
          folder.name &&
          folder.path
      )
  )
}

export async function connect(folder: OutlookFolder): Promise<void> {
  if (!isWindows()) throw new Error(WINDOWS_ONLY_MSG)
  if (!folder?.storeId || !folder?.folderId) throw new Error('Choose an Outlook calendar folder.')
  const folders = await listFolders()
  const match = folders.find((item) => item.storeId === folder.storeId && item.folderId === folder.folderId)
  if (!match) throw new Error('The selected Outlook calendar is no longer available.')
  selected = serializeSelection(match)
  saveOutlookSelection(JSON.stringify(selected))
}

export function disconnect(): void {
  selected = null
  clearOutlookSelection()
}

export async function listUpcoming(minutes = 60): Promise<UpcomingEvent[]> {
  if (!selected) return []
  const now = new Date()
  const end = new Date(now.getTime() + minutes * 60_000)
  const raw = await runPowerShell<PowerShellEvent[] | PowerShellEvent>(LIST_EVENTS_SCRIPT, {
    storeId: selected.storeId,
    folderId: selected.folderId,
    start: now.toISOString(),
    end: end.toISOString()
  })
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []

  return list
    .map((item) => {
      const start = item.start ? new Date(item.start).getTime() : Number.NaN
      if (!item.id || !Number.isFinite(start)) return null
      return {
        id: `outlook:${item.id}`,
        title: item.title?.trim() || 'Untitled event',
        start,
        tentative: item.busyStatus === 1
      }
    })
    .filter((item): item is UpcomingEvent => item !== null)
    .sort((a, b) => a.start - b.start)
}