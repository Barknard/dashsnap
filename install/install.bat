@echo off
setlocal EnableDelayedExpansion

:: ─── ANSI Color Setup ───────────────────────────────────────────────────────
:: Enable ANSI escape sequences on Windows 10+
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
if "%VERSION%" geq "10.0" (
    set "ESC="
) else (
    set "ESC="
)

set "GREEN=%ESC%[92m"
set "CYAN=%ESC%[96m"
set "YELLOW=%ESC%[93m"
set "RED=%ESC%[91m"
set "BOLD=%ESC%[1m"
set "RESET=%ESC%[0m"

:: ─── Header ─────────────────────────────────────────────────────────────────
cls
echo.
echo %CYAN%  ____            _     ____                    %RESET%
echo %CYAN% ^|  _ \  __ _ ___^| ^|__ / ___^|_ __   __ _ _ __  %RESET%
echo %CYAN% ^| ^| ^| ^|/ _` / __^| '_ \\___ \^| '_ \ / _` ^| '_ \ %RESET%
echo %CYAN% ^| ^|_^| ^| (_^| \__ \ ^| ^| ^|___) ^| ^| ^| ^| (_^| ^| ^|_) ^|%RESET%
echo %CYAN% ^|____/ \__,_^|___/_^| ^|_^|____/^|_^| ^|_^|\__,_^| .__/ %RESET%
echo %CYAN%                                          ^|_^|    %RESET%
echo.
echo %BOLD%  Dashboard Screenshot Automation Installer%RESET%
echo   ─────────────────────────────────────────────
echo.

:: ─── Step 1: Check Node.js ──────────────────────────────────────────────────
echo %CYAN%[1/5]%RESET% Checking for Node.js...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo %RED%  ERROR: Node.js is not installed.%RESET%
    echo.
    echo %YELLOW%  Node.js is required to run DashSnap.%RESET%
    echo %YELLOW%  Please install it first:%RESET%
    echo.
    echo %BOLD%    1. Open your browser to: https://nodejs.org%RESET%
    echo %BOLD%    2. Download the LTS version (recommended)%RESET%
    echo %BOLD%    3. Run the Node.js installer%RESET%
    echo %BOLD%    4. Restart your terminal%RESET%
    echo %BOLD%    5. Run this installer again%RESET%
    echo.
    echo %YELLOW%  Direct download link:%RESET%
    echo %CYAN%    https://nodejs.org/en/download/%RESET%
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo %GREEN%  Found Node.js %NODE_VERSION%%RESET%

:: ─── Step 2: Create install directory ───────────────────────────────────────
echo %CYAN%[2/5]%RESET% Creating DashSnap directory...

set "INSTALL_DIR=%USERPROFILE%\DashSnap"

if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %ERRORLEVEL% neq 0 (
        echo %RED%  ERROR: Failed to create directory: %INSTALL_DIR%%RESET%
        pause
        exit /b 1
    )
)
echo %GREEN%  Directory ready: %INSTALL_DIR%%RESET%

:: ─── Step 3: Download latest release ────────────────────────────────────────
echo %CYAN%[3/5]%RESET% Downloading DashSnap installer...

set "DOWNLOAD_URL=https://github.com/Barknard/dashsnap/releases/latest/download/DashSnap-Setup.exe"
set "SETUP_FILE=%INSTALL_DIR%\DashSnap-Setup.exe"

:: Try PowerShell download (most reliable on modern Windows)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { " ^
    "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
    "  $ProgressPreference = 'SilentlyContinue'; " ^
    "  Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%SETUP_FILE%' -UseBasicParsing; " ^
    "  exit 0 " ^
    "} catch { " ^
    "  Write-Host $_.Exception.Message; " ^
    "  exit 1 " ^
    "}" 2>nul

if %ERRORLEVEL% neq 0 (
    echo.
    echo %RED%  ERROR: Download failed.%RESET%
    echo %YELLOW%  Please check your internet connection and try again.%RESET%
    echo %YELLOW%  You can also download manually from:%RESET%
    echo %CYAN%    https://github.com/Barknard/dashsnap/releases/latest%RESET%
    echo.
    pause
    exit /b 1
)

echo %GREEN%  Download complete%RESET%

:: ─── Step 4: Run installer silently ─────────────────────────────────────────
echo %CYAN%[4/5]%RESET% Installing DashSnap...

start /wait "" "%SETUP_FILE%" /S

if %ERRORLEVEL% neq 0 (
    echo %RED%  ERROR: Installation failed (exit code: %ERRORLEVEL%).%RESET%
    echo %YELLOW%  Try running the installer manually: %SETUP_FILE%%RESET%
    pause
    exit /b 1
)

echo %GREEN%  Installation complete%RESET%

:: ─── Step 5: Cleanup and success ────────────────────────────────────────────
echo %CYAN%[5/5]%RESET% Cleaning up...

:: Remove the setup exe after install
del "%SETUP_FILE%" >nul 2>&1

echo.
echo   ─────────────────────────────────────────────
echo.
echo %GREEN%%BOLD%  DashSnap has been installed successfully!%RESET%
echo.
echo %CYAN%  Install location:%RESET% %LOCALAPPDATA%\Programs\DashSnap
echo %CYAN%  Config location:%RESET%  %USERPROFILE%\DashSnap
echo.

:: ─── Offer to launch ────────────────────────────────────────────────────────
set /p LAUNCH="%BOLD%  Launch DashSnap now? (Y/n): %RESET%"

if /i "%LAUNCH%"=="" set LAUNCH=Y
if /i "%LAUNCH%"=="Y" (
    echo.
    echo %CYAN%  Starting DashSnap...%RESET%
    start "" "%LOCALAPPDATA%\Programs\DashSnap\DashSnap.exe"
    echo %GREEN%  Done! Enjoy DashSnap.%RESET%
) else (
    echo.
    echo %CYAN%  You can launch DashSnap from the Start Menu or Desktop shortcut.%RESET%
)

echo.
pause
exit /b 0
