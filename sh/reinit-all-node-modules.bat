@echo off
setlocal

REM Get script directory
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

set "BRUTEFORCE=0"

REM Parse arguments
:parse_args
if "%~1"=="" goto :start
if "%~1"=="--bruteforce" (
    set "BRUTEFORCE=1"
    shift
    goto :parse_args
)
if "%~1"=="-h" goto :help
if "%~1"=="--help" goto :help
echo Unknown argument: %~1
echo Try: %~nx0 --help
exit /b 1

:help
echo Usage: %~nx0 [--bruteforce]
echo   --bruteforce   Also delete lockfiles (package-lock.json, yarn.lock, pnpm-lock.yaml).
exit /b 0

:start
echo ==== Reinit all node_modules (root: %ROOT%) ====
if "%BRUTEFORCE%"=="1" (
    echo [MODE] bruteforce (lockfiles will be deleted)
) else (
    echo [MODE] safe (lockfiles kept)
)

echo [INFO] mac -^> Windows: copied node_modules are not usable (native binaries). This script removes them.

REM WHITELIST approach: only delete node_modules next to a package.json
REM This avoids touching ios/Pods, .git, or any other unrelated folders.

echo [INFO] Scanning for package.json files and removing their node_modules...

REM Known project roots (explicit whitelist)
call :clean_project "%ROOT%\awi"
REM call :clean_project "%ROOT%\my-app\backoffice"
REM call :clean_project "%ROOT%\my-app\frontend"

echo ==== DONE ====
pause
exit /b 0

:clean_project
set "PROJECT_DIR=%~1"
if not exist "%PROJECT_DIR%\package.json" (
    echo [SKIP] %PROJECT_DIR% (no package.json)
    goto :eof
)
echo [PROJECT] %PROJECT_DIR%
if exist "%PROJECT_DIR%\node_modules" (
    echo   Removing node_modules...
    rmdir /s /q "%PROJECT_DIR%\node_modules" 2>nul
)
if exist "%PROJECT_DIR%\dist" (
    echo   Removing dist...
    rmdir /s /q "%PROJECT_DIR%\dist" 2>nul
)
if exist "%PROJECT_DIR%\build" (
    echo   Removing build...
    rmdir /s /q "%PROJECT_DIR%\build" 2>nul
)
if exist "%PROJECT_DIR%\.vite" (
    echo   Removing .vite...
    rmdir /s /q "%PROJECT_DIR%\.vite" 2>nul
)
if exist "%PROJECT_DIR%\.parcel-cache" (
    echo   Removing .parcel-cache...
    rmdir /s /q "%PROJECT_DIR%\.parcel-cache" 2>nul
)
if exist "%PROJECT_DIR%\.next" (
    echo   Removing .next...
    rmdir /s /q "%PROJECT_DIR%\.next" 2>nul
)
if exist "%PROJECT_DIR%\.nuxt" (
    echo   Removing .nuxt...
    rmdir /s /q "%PROJECT_DIR%\.nuxt" 2>nul
)
if exist "%PROJECT_DIR%\.svelte-kit" (
    echo   Removing .svelte-kit...
    rmdir /s /q "%PROJECT_DIR%\.svelte-kit" 2>nul
)
if exist "%PROJECT_DIR%\.cache" (
    echo   Removing .cache...
    rmdir /s /q "%PROJECT_DIR%\.cache" 2>nul
)
if exist "%PROJECT_DIR%\.DS_Store" (
    echo   Removing .DS_Store...
    del /q "%PROJECT_DIR%\.DS_Store" 2>nul
)
if "%BRUTEFORCE%"=="1" (
    if exist "%PROJECT_DIR%\package-lock.json" (
        echo   Removing package-lock.json...
        del /q "%PROJECT_DIR%\package-lock.json" 2>nul
    )
    if exist "%PROJECT_DIR%\pnpm-lock.yaml" (
        echo   Removing pnpm-lock.yaml...
        del /q "%PROJECT_DIR%\pnpm-lock.yaml" 2>nul
    )
    if exist "%PROJECT_DIR%\yarn.lock" (
        echo   Removing yarn.lock...
        del /q "%PROJECT_DIR%\yarn.lock" 2>nul
    )
)
goto :eof
