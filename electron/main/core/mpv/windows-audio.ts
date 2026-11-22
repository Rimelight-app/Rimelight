import { execFile } from 'node:child_process'

/**
 * Which Windows audio endpoints belong to a Bluetooth device. An endpoint's
 * PnP id is "SWD\MMDEVAPI\{0.0.0.00000000}.{guid}" (the same id mpv uses after
 * "wasapi/"); it shares a container id with its Bluetooth parent device.
 * Best effort: returns an empty set if PowerShell fails.
 */
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$bt = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE|BTHHFENUM)' } | ForEach-Object { (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_ContainerId').Data } | ForEach-Object { "$_".ToLower() })
$out = @(Get-PnpDevice -Class AudioEndpoint -PresentOnly | ForEach-Object {
  $c = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_ContainerId').Data
  if ($bt -contains "$c".ToLower()) { $_.InstanceId }
})
$out | ConvertTo-Json -Compress
`

let cache: { at: number; ids: Set<string> } | null = null

export function bluetoothEndpointIds(): Promise<Set<string>> {
  if (process.platform !== 'win32') return Promise.resolve(new Set())
  if (cache && Date.now() - cache.at < 300_000)
    return Promise.resolve(cache.ids)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { timeout: 15000, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const ids = new Set<string>()
        if (!err) {
          try {
            const parsed = JSON.parse(stdout.trim() || '[]')
            for (const id of Array.isArray(parsed) ? parsed : [parsed]) {
              const m = String(id).match(/MMDEVAPI\\(.+)$/i)
              if (m) ids.add(m[1].toLowerCase())
            }
          } catch {
            // ignore
          }
        }
        cache = { at: Date.now(), ids }
        resolve(ids)
      },
    )
  })
}

/** Names that give Bluetooth away even when PowerShell can't tell. */
export function looksLikeBluetooth(name: string) {
  return /bluetooth|hands-?free|\bA2DP\b|airpods/i.test(name)
}
