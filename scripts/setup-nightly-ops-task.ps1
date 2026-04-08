param(
  [string]$TaskName = "MissionControl Nightly Ops",
  [string]$StartTime = "22:30"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRootText = $ProjectRoot.Path
$LogPath = Join-Path $ProjectRootText "reports\ops\nightly-ops-task.log"

New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRootText "reports\ops") | Out-Null

$command = "Set-Location -LiteralPath '$ProjectRootText'; npm run ops:nightly *> '$LogPath'"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Output "Scheduled task configured: $TaskName at $StartTime"
Write-Output "Project root: $ProjectRootText"
Write-Output "Task log: $LogPath"
