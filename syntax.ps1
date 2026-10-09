# syntax.ps1 - check project files for syntax errors

Write-Host "=== TypeScript check ===" -ForegroundColor Cyan
npx tsc --noEmit

Write-Host "=== Prisma schema check ===" -ForegroundColor Cyan
npx prisma validate

Write-Host "=== JSON check ===" -ForegroundColor Cyan
Get-ChildItem -Recurse -Include *.json,*.jsonc -File |
    Where-Object { $_.FullName -notmatch "node_modules|\.next|dist|build" } |
    ForEach-Object {
        try {
            $content = Get-Content -LiteralPath $_.FullName -Raw
            if ($_.Extension -eq ".jsonc") {
                $content = $content -replace '(?m)^\s*//.*$','' -replace '(?m)/\*[\s\S]*?\*/',''
            }
            $null = $content | ConvertFrom-Json
            Write-Host "OK: $($_.Name)" -ForegroundColor Green
        } catch {
            Write-Host "INVALID: $($_.Name) - $_" -ForegroundColor Red
        }
    }