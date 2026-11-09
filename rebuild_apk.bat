@echo off
title Rebuilding Zettbos Admin APK
echo =======================================================
echo     Zettbos Admin APK Rebuild Utility (Anti-File-Lock)
echo =======================================================
echo.
echo [1/4] Menghentikan daemon Gradle ^& proses Java...
cd ZettbosAdminApp
call gradlew.bat --stop >nul 2>&1
taskkill /f /im java.exe >nul 2>&1
taskkill /f /im jbd.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [2/4] Membersihkan folder build lama ^& crash dump log...
if exist "app\build" (
    rd /s /q "app\build" 2>nul
)
del /f /q hs_err_pid*.log 2>nul
del /f /q replay_pid*.log 2>nul
del /f /q "..\hs_err_pid*.log" 2>nul
del /f /q "..\replay_pid*.log" 2>nul
if exist "..\extracted_apk_v1" (
    rd /s /q "..\extracted_apk_v1" 2>nul
)
if exist "..\ZettbosAdmin1.apk" (
    del /f /q "..\ZettbosAdmin1.apk" 2>nul
)

echo.
echo [3/5] Menyinkronkan file Index.html terbaru ke aset APK...
copy /y "..\Index.html" "app\src\main\assets\index.html" >nul
echo       Index.html tersinkronisasi ke folder assets.

echo.
echo [4/5] Mengonfigurasi parameter alokasi memori...
set GRADLE_OPTS=-Xmx1536m -XX:MaxMetaspaceSize=384m -Dorg.gradle.daemon=false -Dorg.gradle.vfs.watch=false

echo.
echo [5/5] Menjalankan kompilasi APK bersih (Clean Build)...
call gradlew.bat assembleDebug --no-daemon --max-workers=1 --stacktrace

if errorlevel 1 goto BUILD_ERROR

echo.
echo =======================================================
echo [SUKSES] Kompilasi berhasil! Menyalin APK ke folder utama...
echo =======================================================
copy /y "app\build\outputs\apk\debug\app-debug.apk" "..\ZettbosAdmin.apk"
echo APK telah diperbarui di folder root: ZettbosAdmin.apk
goto FINISH

:BUILD_ERROR
echo.
echo =======================================================
echo [GAGAL] Kompilasi APK belum berhasil.
echo =======================================================

:FINISH
cd ..
echo.
echo =======================================================
echo Selesai. Tekan tombol apa saja untuk keluar...
echo =======================================================
pause
