# syntax.ps1 - TypeScript + Prisma + JSON validation (ASCII-safe)

Write-Host "=== TypeScript check ===" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -eq 0) {
    Write-Host "TypeScript: OK" -ForegroundColor Green
} else {
    Write-Host "TypeScript: FAILED" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Prisma schema check ===" -ForegroundColor Cyan
npx prisma validate

Write-Host ""
Write-Host "=== JSON check ===" -ForegroundColor Cyan

$skipPatterns = @(
    "node_modules",
    "\.next",
    "package-lock\.json",
    "pnpm-lock\.yaml",
    "yarn\.lock"
)

Get-ChildItem -Recurse -Filter "*.json" | Where-Object {
    $path = $_.FullName
    $skip = $false
    foreach ($pat in $skipPatterns) {
        if ($path -match $pat) { $skip = $true; break }
    }
    -not $skip
} | ForEach-Object {
    try {
        $content = Get-Content $_.FullName -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($content)) {
            Write-Host "EMPTY: $($_.FullName)" -ForegroundColor Yellow
        } else {
            $null = $content | ConvertFrom-Json -ErrorAction Stop
            Write-Host "OK: $($_.FullName)" -ForegroundColor Green
        }
    } catch {
        $msg = $_.Exception.Message
        Write-Host "INVALID: $($_.FullName) - $msg" -ForegroundColor Red
    }
}