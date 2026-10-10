# backup-db.ps1 - Timestamped SQLite backup with rotation
param(
    [int]$Keep = 30   # how many backups to keep
)

$ErrorActionPreference = "Stop"
$dbPath     = Join-Path $PSScriptRoot "prisma\pacific_trips.db"
$backupDir  = Join-Path $PSScriptRoot "backups"

if (-not (Test-Path $dbPath)) {
    Write-Host "DB not found at $dbPath" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force $backupDir | Out-Null

$stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$target = Join-Path $backupDir "pacific_trips_$stamp.db"

Copy-Item $dbPath $target
Write-Host "Backed up -> $target" -ForegroundColor Green
Write-Host ("Size: {0:N0} bytes" -f (Get-Item $target).Length) -ForegroundColor DarkGray

# Prune old backups
$all = Get-ChildItem $backupDir -Filter "pacific_trips_*.db" |
       Sort-Object LastWriteTime -Descending
if ($all.Count -gt $Keep) {
    $all | Select-Object -Skip $Keep | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "Removed old backup: $($_.Name)" -ForegroundColor Yellow
    }
}