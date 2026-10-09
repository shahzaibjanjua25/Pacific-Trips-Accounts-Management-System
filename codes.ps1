# Save this script as Export-Code.ps1 and run it in your project root directory

$outputFile  = "all-code.txt"
$projectRoot = Get-Location

if (Test-Path $outputFile) { Remove-Item $outputFile }

# Include every extension that matters for a Next.js + Prisma + TS project
$extensions = @(
    "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs",
    "*.css", "*.scss", "*.sass",
    "*.json", "*.jsonc",
    "*.md", "*.mdx",
    "*.html",
    "*.yml", "*.yaml",
    "*.prisma",
    "*.sql",
    "*.txt",
    "*.ps1", "*.sh", "*.bat"
)

# .env variants handled separately (dot-prefixed files aren't matched reliably by -Include)
$envPatterns = @(".env", ".env.*", "*.env", "*.env.*")

$excludeDirs = @(
    "node_modules", ".git", "dist", "build", ".vscode",
    "coverage", ".next", "out", ".cache", ".turbo",
    ".vercel", ".idea", "tmp", "temp"
)

# Directories that SHOULD be included even if they look generated
# (add to this list if you have custom generated code you want captured)
$neverExclude = @()

$files = Get-ChildItem -Recurse -File | Where-Object {
    $path = $_.FullName

    # Must match an extension OR an .env pattern
    $extMatch = $false
    foreach ($ext in $extensions) {
        if ($_.Name -like $ext) { $extMatch = $true; break }
    }
    if (-not $extMatch) {
        foreach ($pat in $envPatterns) {
            if ($_.Name -like $pat) { $extMatch = $true; break }
        }
    }
    if (-not $extMatch) { return $false }

    # Skip lock files (huge, not useful) — remove these lines if you want them
    if ($_.Name -eq "package-lock.json" -or $_.Name -eq "pnpm-lock.yaml" -or $_.Name -eq "yarn.lock") {
        return $false
    }

    # Skip excluded directories unless explicitly whitelisted
    foreach ($dir in $excludeDirs) {
        if ($path -match "\\$([regex]::Escape($dir))\\") {
            foreach ($keep in $neverExclude) {
                if ($path -match "\\$([regex]::Escape($keep))\\") { return $true }
            }
            return $false
        }
    }

    return $true
}

$files = $files | Sort-Object FullName

Write-Host "Found $($files.Count) files to process..." -ForegroundColor Cyan
foreach ($f in $files) {
    Write-Host ("  - " + $f.FullName.Substring($projectRoot.Path.Length + 1)) -ForegroundColor DarkGray
}

foreach ($file in $files) {
    try {
        $relativePath = $file.FullName.Substring($projectRoot.Path.Length + 1)

        "=" * 80 | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "// FILE: $relativePath" | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "=" * 80 | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "" | Out-File -FilePath $outputFile -Append -Encoding UTF8

        # FIX: use -LiteralPath so brackets like [id] are not treated as wildcards
        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Strip BOM if present
            if ($content.Length -gt 0 -and [int][char]$content[0] -eq 0xFEFF) {
                $content = $content.Substring(1)
            }
            $content | Out-File -FilePath $outputFile -Append -Encoding UTF8
        } else {
            "[Empty file or binary content]" | Out-File -FilePath $outputFile -Append -Encoding UTF8
        }

        "" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    }
    catch {
        Write-Host "Error processing $($file.Name): $_" -ForegroundColor Red
        "// ERROR processing this file" | Out-File -FilePath $outputFile -Append -Encoding UTF8
        "" | Out-File -FilePath $outputFile -Append -Encoding UTF8
    }
}

Write-Host "`nAll code exported to: $outputFile" -ForegroundColor Yellow
Write-Host "Total files processed: $($files.Count)" -ForegroundColor Cyan