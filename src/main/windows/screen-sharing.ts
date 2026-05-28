import { execFileSync } from 'node:child_process'

const CACHE_TTL_MS = 10_000

const WINDOWS_SCREEN_SHARE_SCRIPT = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class QuakPitWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$conferenceProcessNames = @("ms-teams", "teams", "zoom", "zoomworkplace")
$browserProcessNames = @("chrome", "msedge", "firefox", "brave", "opera", "opera_gx", "vivaldi", "arc")
$strongShareMarkers = @(
  "sharing your screen",
  "sharing your tab",
  "tab is being shared",
  "screen is being shared",
  "you are sharing",
  "you're sharing",
  "you are presenting",
  "you're presenting",
  "stop sharing"
)
$weakShareMarkers = @(
  "screen share",
  "screen-sharing",
  "screenshare",
  "share tray",
  "presenting",
  "is sharing",
  "is presenting"
)
$meetingMarkers = @(
  "google meet",
  "microsoft teams",
  "teams",
  "zoom",
  "webex",
  "slack call",
  "slack huddle"
)

$script:sharing = $false
[QuakPitWindows]::EnumWindows({
  param($hWnd, $lParam)

  if (-not [QuakPitWindows]::IsWindowVisible($hWnd)) { return $true }

  $length = [QuakPitWindows]::GetWindowTextLengthW($hWnd)
  if ($length -le 0) { return $true }

  $buffer = New-Object System.Text.StringBuilder ($length + 1)
  [void][QuakPitWindows]::GetWindowTextW($hWnd, $buffer, $buffer.Capacity)
  $title = $buffer.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }

  $pid = 0
  [void][QuakPitWindows]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  if ($pid -le 0) { return $true }

  try {
    $process = Get-Process -Id $pid -ErrorAction Stop
  } catch {
    return $true
  }

  $processName = $process.ProcessName.ToLowerInvariant()
  $isConferenceProcess = $conferenceProcessNames -contains $processName
  $isBrowserProcess = $browserProcessNames -contains $processName
  if (-not $isConferenceProcess -and -not $isBrowserProcess) { return $true }

  $titleLower = $title.ToLowerInvariant()
  $hasStrongShareMarker = $false
  foreach ($marker in $strongShareMarkers) {
    if ($titleLower.Contains($marker)) {
      $hasStrongShareMarker = $true
      break
    }
  }

  $hasWeakShareMarker = $false
  if (-not $hasStrongShareMarker) {
    foreach ($marker in $weakShareMarkers) {
      if ($titleLower.Contains($marker)) {
        $hasWeakShareMarker = $true
        break
      }
    }
  }

  if (-not $hasStrongShareMarker -and -not $hasWeakShareMarker) { return $true }

  if ($isConferenceProcess) {
    $script:sharing = $true
    return $false
  }

  foreach ($marker in $meetingMarkers) {
    if ($titleLower.Contains($marker)) {
      $script:sharing = $true
      return $false
    }
  }

  if ($hasStrongShareMarker) {
    $script:sharing = $true
    return $false
  }

  return $true
}, [IntPtr]::Zero) | Out-Null

if ($script:sharing) {
  Write-Output 'true'
} else {
  Write-Output 'false'
}
`

const WINDOWS_TEAMS_SHARE_ARGS = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(WINDOWS_SCREEN_SHARE_SCRIPT, 'utf16le').toString('base64')
]

const MACOS_SCREEN_SHARE_SCRIPT = String.raw`
ObjC.import('CoreGraphics')

const options = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements
const windows = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo(options, $.kCGNullWindowID))

const ownerMarkers = ['controlcenter', 'systemuiserver', 'window server']
const titleMarkers = [
  'screen sharing',
  'screen recording',
  'sharing your screen',
  'recording your screen',
  'presenting',
  'screen capture'
]

const active = windows.some((entry) => {
  const owner = String(entry.kCGWindowOwnerName || '').toLowerCase()
  const title = String(entry.kCGWindowName || '').toLowerCase()
  if (!owner || !title) return false

  const ownerMatch = ownerMarkers.some((marker) => owner.includes(marker))
  if (!ownerMatch) return false

  return titleMarkers.some((marker) => title.includes(marker))
})

console.log(active ? 'true' : 'false')
`

const MACOS_SCREEN_SHARE_ARGS = ['-l', 'JavaScript', '-e', MACOS_SCREEN_SHARE_SCRIPT]

let cachedValue = false
let cachedAt = 0

function runBooleanProbe(command: string, args: string[]): boolean {
    try {
        const output = execFileSync(command, args, {
            encoding: 'utf8',
            timeout: 1500,
            windowsHide: true
        })
        return output.trim().toLowerCase() === 'true'
    } catch {
        return false
    }
}

export function isScreenSharingActive(): boolean {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return false

    const now = Date.now()
    if (now - cachedAt < CACHE_TTL_MS) return cachedValue

    if (process.platform === 'win32') {
        cachedValue = runBooleanProbe('powershell.exe', WINDOWS_TEAMS_SHARE_ARGS)
    } else {
        cachedValue = runBooleanProbe('osascript', MACOS_SCREEN_SHARE_ARGS)
    }

    cachedAt = now
    return cachedValue
}