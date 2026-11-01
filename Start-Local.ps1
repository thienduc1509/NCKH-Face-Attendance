param([switch]$Build)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Build) { docker compose -f compose.local.yml build; if ($LASTEXITCODE) { throw 'Build failed' } }
docker compose -f compose.local.yml up -d postgres redis
if ($LASTEXITCODE) { throw 'Database startup failed' }
docker compose -f compose.local.yml run --rm backend alembic upgrade head
if ($LASTEXITCODE) { throw 'Migration failed' }
docker compose -f compose.local.yml run --rm backend python -m app.initial_data
if ($LASTEXITCODE) { throw 'Admin initialization failed' }
docker compose -f compose.local.yml up -d
if ($LASTEXITCODE) { throw 'Application startup failed' }
Write-Host 'Web: http://localhost:3000 | API: http://localhost:8000/api/docs'
