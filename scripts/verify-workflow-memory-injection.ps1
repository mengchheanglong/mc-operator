param(
  [string]$Workspace = "C:\Users\User\.openclaw\workspace",
  [string]$Agent = "main",
  [int]$SessionCount = 2
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

$workflowPath = Join-Path $Workspace "memory.md"
if (-not (Test-Path -LiteralPath $workflowPath)) {
  Fail "Verification failed: memory.md not found at $workflowPath"
}

$content = Get-Content -LiteralPath $workflowPath -Raw -ErrorAction Stop
$chars = if ($null -eq $content) { 0 } else { $content.Length }
if ($chars -le 0) {
  Fail "Verification failed: memory.md exists but is empty."
}

$configPath = "C:\Users\User\.openclaw\openclaw.json"
if (-not (Test-Path -LiteralPath $configPath)) {
  Fail "Verification failed: OpenClaw config not found at $configPath"
}

$configRaw = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop
try {
  $config = $configRaw | ConvertFrom-Json
} catch {
  Fail ("Verification failed: could not parse config JSON: " + $_.Exception.Message)
}

$hook = $null
if ($config.hooks -and $config.hooks.internal -and $config.hooks.internal.entries) {
  $hook = $config.hooks.internal.entries."bootstrap-extra-files"
}

if (-not $hook) {
  Fail "Verification failed: hooks.internal.entries.bootstrap-extra-files not configured."
}

$enabled = [bool]$hook.enabled
$paths = @()
if ($hook.paths) { $paths = @($hook.paths) }
elseif ($hook.patterns) { $paths = @($hook.patterns) }
elseif ($hook.files) { $paths = @($hook.files) }

$hasMemoryPath = $paths | Where-Object { $_ -eq "memory.md" } | Select-Object -First 1

Write-Host ("Workflow memory path: " + $workflowPath)
Write-Host ("Workflow memory chars: " + $chars)
Write-Host ("Hook enabled: " + $enabled)
Write-Host ("Hook paths: " + (($paths -join ", ")))

if (-not $enabled) {
  Fail "Verification failed: bootstrap-extra-files hook is disabled."
}

if (-not $hasMemoryPath) {
  Fail "Verification failed: memory.md is not listed in bootstrap-extra-files paths/patterns/files."
}

if ($SessionCount -lt 1) {
  Fail "Verification failed: SessionCount must be >= 1"
}

for ($i = 1; $i -le $SessionCount; $i++) {
  $sessionId = "verify-workflow-memory-$i-$([Guid]::NewGuid().ToString())"
  $cmd = @(
    "agent",
    "--agent", $Agent,
    "--session-id", $sessionId,
    "--message", "ping",
    "--json"
  )

  Write-Host ("Running session check ${i}/${SessionCount}: openclaw.cmd " + ($cmd -join " "))
  $raw = (& openclaw.cmd @cmd 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    Fail "Failed to run openclaw agent JSON check for session $i." $raw
  }

  $jsonText = Extract-JsonText $raw
  if (-not $jsonText) {
    Fail "Could not locate JSON payload in command output for session $i." $raw
  }

  try {
    $json = $jsonText | ConvertFrom-Json
  } catch {
    Fail ("Failed to parse JSON for session ${i}: " + $_.Exception.Message) $jsonText
  }

  $meta = $null
  if ($json.PSObject.Properties.Name -contains "result") {
    $meta = $json.result.meta
  }
  if (-not $meta -and ($json.PSObject.Properties.Name -contains "meta")) {
    $meta = $json.meta
  }
  if (-not $meta) {
    Fail "JSON payload missing meta section for session $i." $jsonText
  }

  $report = $meta.systemPromptReport
  if (-not $report) {
    Fail "JSON payload missing systemPromptReport for session $i." $jsonText
  }

  $files = @($report.injectedWorkspaceFiles)
  $workflowMemory = $files | Where-Object {
    [string]$name = [string]$_.name
    [string]$path = [string]$_.path
    ($name -ceq "memory.md") -or ($path.ToLower().EndsWith("\\memory.md"))
  } | Select-Object -First 1

  if (-not $workflowMemory) {
    $seen = ($files | ForEach-Object { $_.name }) -join ", "
    Fail ("memory.md not found in injectedWorkspaceFiles for session $i. Seen: " + $seen) $jsonText
  }

  $missing = [bool]$workflowMemory.missing
  $injectedChars = [int]$workflowMemory.injectedChars

  Write-Host ("Session $i memory path: " + [string]$workflowMemory.path)
  Write-Host ("Session $i memory missing: " + $missing)
  Write-Host ("Session $i memory injectedChars: " + $injectedChars)

  if ($missing -or $injectedChars -le 0) {
    Fail "Verification failed: memory.md is missing or empty in injected context for session $i." $jsonText
  }
}

Write-Host "Verification passed: workflow memory is configured and injected in every checked fresh session." -ForegroundColor Green
exit 0
