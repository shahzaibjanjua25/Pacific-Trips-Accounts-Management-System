@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   Pacific Trips - UI Fix Script
echo ============================================
echo.

REM ---------- 1. Backup ----------
set "STAMP=%date:~-4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "STAMP=%STAMP: =0%"
set "BACKUP=._backup_%STAMP%"
echo [1/9] Creating backup at %BACKUP%
mkdir "%BACKUP%" 2>nul
xcopy /E /I /Y /Q "src" "%BACKUP%\src" >nul 2>&1
copy /Y "next.config.ts" "%BACKUP%\" >nul 2>&1
copy /Y "next-env.d.ts"  "%BACKUP%\" >nul 2>&1
echo    Done.
echo.

REM ---------- 2. next.config.ts ----------
echo [2/9] Fixing next.config.ts
> "next.config.ts" (
  echo import type { NextConfig } from "next";
  echo.
  echo const nextConfig: NextConfig = {};
  echo.
  echo export default nextConfig;
)
echo    Done.
echo.

REM ---------- 3. next-env.d.ts ----------
echo [3/9] Fixing next-env.d.ts
> "next-env.d.ts" (
  echo /// ^<reference types="next" /^>
  echo /// ^<reference types="next/image-types/global" /^>
  echo.
  echo // NOTE: This file should not be edited
  echo // see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
)
echo    Done.
echo.

REM ---------- 4. src\lib\branding.ts ----------
echo [4/9] Fixing src\lib\branding.ts
> "src\lib\branding.ts" (
  echo /**;
  echo  * Brand assets.
  echo  * Uses local static asset only - external CDN URLs expire.
  echo  */;
  echo export const PRIMARY_LOGO_URL = "/logo.png?v=2";
  echo export const FALLBACK_LOGO_URL = "logo.jpg";
)
echo    Done.
echo.

REM ---------- 5. src\lib\crud-api.ts - remove duplicate import ----------
echo [5/9] Deduplicating imports in src\lib\crud-api.ts
powershell -NoProfile -Command ^
  "$p='src\lib\crud-api.ts'; $c=Get-Content -Raw -LiteralPath $p; $c=$c -replace '(?m)^import \{ computeReceivableRemaining, computePayrollNet \} from \"\./money\"; // \[PT-AUDIT-FIX-CRUD-IMPORTS\]\r?\n',''; Set-Content -NoNewline -LiteralPath $p -Value $c"
echo    Done.
echo.

REM ---------- 6. src\lib\links-service.ts - remove duplicate import ----------
echo [6/9] Deduplicating imports in src\lib\links-service.ts
powershell -NoProfile -Command ^
  "$p='src\lib\links-service.ts'; $c=Get-Content -Raw -LiteralPath $p; $c=$c -replace '(?m)^import \{ computeReceivableRemaining, computePayableRemaining \} from \"\./money\"; // \[PT-AUDIT-FIX-LINKS-IMPORTS\]\r?\n',''; Set-Content -NoNewline -LiteralPath $p -Value $c"
echo    Done.
echo.

REM ---------- 7. src\lib\dashboard.ts - remove duplicate import ----------
echo [7/9] Deduplicating imports in src\lib\dashboard.ts
powershell -NoProfile -Command ^
  "$p='src\lib\dashboard.ts'; $c=Get-Content -Raw -LiteralPath $p; $c=$c -replace '(?m)^import \{ computeFreeCash, computeProjectedCash, daysOverdue \} from \"\./money\"; // \[PT-AUDIT-FIX-DASH-IMPORTS\]\r?\n',''; Set-Content -NoNewline -LiteralPath $p -Value $c"
echo    Done.
echo.

REM ---------- 8. src\app\globals.css ----------
echo [8/9] Fixing src\app\globals.css (removing dark-mode override)
> "src\app\globals.css" (
  echo @import "tailwindcss";
  echo.
  echo :root {
  echo   --background: #ffffff;
  echo   --foreground: #171717;
  echo }
  echo.
  echo @theme inline {
  echo   --color-background: var(--background);
  echo   --color-foreground: var(--foreground);
  echo   --font-sans: var(--font-geist-sans);
  echo   --font-mono: var(--font-geist-mono);
  echo }
  echo.
  echo body {
  echo   background: var(--background);
  echo   color: var(--foreground);
  echo   font-family: Arial, Helvetica, sans-serif;
  echo }
)
echo    Done.
echo.

REM ---------- 9. Ensure public\logo.png exists ----------
echo [9/9] Checking public\logo.png
if not exist "public" mkdir "public"
if exist "public\logo.png" (
  echo    public\logo.png already exists.
) else (
  if exist "public\logo.jpg" (
    echo    Copying public\logo.jpg -^> public\logo.png
    copy /Y "public\logo.jpg" "public\logo.png" >nul
  ) else (
    echo    WARNING: Neither public\logo.png nor public\logo.jpg exists.
    echo    Create one manually, or edit src\lib\branding.ts to point to your logo file.
  )
)
echo.

REM ---------- Clean and reinstall ----------
echo ============================================
echo   Cleaning build artifacts
echo ============================================
if exist ".next" rmdir /S /Q ".next"
if exist "node_modules\.cache" rmdir /S /Q "node_modules\.cache"
echo    Removed .next and node_modules cache.
echo.

echo ============================================
echo   Regenerating Prisma client + pushing DB
echo ============================================
call npx prisma generate
if errorlevel 1 goto :err
call npx prisma db push
if errorlevel 1 goto :err
echo.

echo ============================================
echo   Done! Backup is at: %BACKUP%
echo   Now run:  npm run dev
echo ============================================
goto :eof

:err
echo.
echo *** ERROR: command failed. Check output above. ***
exit /b 1