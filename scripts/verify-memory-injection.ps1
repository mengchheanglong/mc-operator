param(
  [string]$Agent = "main"
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message, [string]$Raw = "") {
  Write-Host $Message -ForegroundColor Red
  if ($Raw) {
    Write-Host "Raw output:" -ForegroundColor Yellow
    Write-Host $Raw
  }
  exit 1
}

function Extract-JsonText([string]$Text) {
  if (-not $Text) { return $null }
  $start = $Text.IndexOf("{")
  $end = $Text.LastIndexOf("}")
  if ($start -lt 0 -or $end -lt $start) { return $null }
  return $Text.Substring($start, $end - $start + 1)
}

$sessionId = "verify-memory-$([Guid]::NewGuid().ToString())"
$cmd = @(
  "agent",
  "--agent", $Agent,
  "--session-id", $sessionId,
  "--message", "ping",
  "--json"
)

Write-Host ("Running: openclaw.cmd " + ($cmd -join " "))
$raw = (& openclaw.cmd @cmd 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  Fail "Failed to run openclaw agent JSON check." $raw
}

$jsonText = Extract-JsonText $raw
if (-not $jsonText) {
  Fail "Could not locate JSON payload in command output." $raw
}

try {
  $json = $jsonText | ConvertFrom-Json
} catch {
  Fail ("Failed to parse JSON: " + $_.Exception.Message) $jsonText
}

$meta = $null
if ($json.PSObject.Properties.Name -contains "result") {
  $meta = $json.result.meta
}
if (-not $meta -and ($json.PSObject.Properties.Name -contains "meta")) {
  $meta = $json.meta
}
if (-not $meta) {
  Fail "JSON payload missing meta section." $jsonText
}

$report = $meta.systemPromptReport
if (-not $report) {
  Fail "JSON payload missing systemPromptReport." $jsonText
}

$files = @($report.injectedWorkspaceFiles)
$memoryFile = $files | Where-Object {
  $_.name -eq "MEMORY.md" -or ($_.path -match '[\\/]MEMORY\.md$')
} | Select-Object -First 1

if (-not $memoryFile) {
  $names = ($files | ForEach-Object { $_.name }) -join ", "
  Fail ("MEMORY.md not found in injectedWorkspaceFiles. Seen: " + $names) $jsonText
}

$missing = [bool]$memoryFile.missing
$chars = [int]$memoryFile.injectedChars
$provider = if ($meta.agentMeta) { [string]$meta.agentMeta.provider } else { "" }
$model = if ($meta.agentMeta) { [string]$meta.agentMeta.model } else { "" }

Write-Host ("Provider: " + $provider)
Write-Host ("Model: " + $model)
Write-Host ("MEMORY path: " + [string]$memoryFile.path)
Write-Host ("MEMORY missing: " + $missing)
Write-Host ("MEMORY injectedChars: " + $chars)

if ($missing -or $chars -le 0) {
  Fail "Verification failed: MEMORY.md is missing or empty in injected context." $jsonText
}

Write-Host "Verification passed: MEMORY.md is injected into fresh session context." -ForegroundColor Green
exit 0
