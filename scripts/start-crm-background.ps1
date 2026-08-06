$projectRoot = Split-Path -Parent $PSScriptRoot
$stdoutLog = Join-Path $projectRoot ".crm-dev.stdout.log"
$stderrLog = Join-Path $projectRoot ".crm-dev.stderr.log"

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  exit 0
}

Start-Process `
  -FilePath "C:\Program Files\nodejs\npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog
