[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL_LOCAL,
  [string]$SeedPath = (Join-Path $PSScriptRoot 'seed-np-local.sql')
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL_LOCAL is empty. Set APP_ENV=local and DATABASE_URL_LOCAL before seeding.'
}

if (-not (Test-Path -LiteralPath $SeedPath)) {
  throw "Seed file not found: $SeedPath"
}

$previousCodePageOutput = (& chcp)
$previousCodePage = ($previousCodePageOutput -replace '[^\d]', '')

try {
  chcp 65001 | Out-Null
  $env:PGCLIENTENCODING = 'UTF8'

  Write-Host "Seeding NP local catalog from: $SeedPath"
  & psql "$DatabaseUrl" -v ON_ERROR_STOP=1 -f "$SeedPath"
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
}
finally {
  if ($previousCodePage) {
    chcp $previousCodePage | Out-Null
  }
}
