@echo off
chcp 65001 >nul
echo ========================================================
echo       INSTALLATION DE MOTORS 2L SUR WINDOWS 10 / 11
echo ========================================================
echo.

set SCRIPT_DIR=%~dp0
set TARGET_EXE=%SCRIPT_DIR%MOTORS-2L.exe

if not exist "%TARGET_EXE%" (
    set TARGET_EXE=%SCRIPT_DIR%..\MOTORS-2L.exe
)

if not exist "%TARGET_EXE%" (
    echo [ERREUR] Fichier MOTORS-2L.exe introuvable !
    pause
    exit /b 1
)

echo [1/2] Création du raccourci sur le Bureau...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'MOTORS 2L.lnk')); $s.TargetPath = '%TARGET_EXE%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Application MOTORS 2L - Atelier & Chat'; $s.Save()"

echo [2/2] Création du raccourci dans le Menu Démarrer...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $programs = [Environment]::GetFolderPath('Programs'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($programs, 'MOTORS 2L.lnk')); $s.TargetPath = '%TARGET_EXE%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Application MOTORS 2L - Atelier & Chat'; $s.Save()"

echo.
echo ========================================================
echo   INSTALLATION TERMINÉE AVEC SUCCÈS POUR WINDOWS !
echo   Vous pouvez lancer MOTORS 2L depuis votre Bureau
echo   ou depuis votre Menu Démarrer Windows 10 / 11.
echo ========================================================
echo.
pause

