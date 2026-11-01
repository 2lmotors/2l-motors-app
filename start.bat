@echo off
echo.
echo  ==================================
echo   2LMotors - Demarrage du serveur
echo  ==================================
echo.

:: Add Node.js to PATH if not already there
set PATH=C:\Program Files\nodejs;%PATH%

:: Check if node_modules exists
if not exist "node_modules" (
    echo  [INFO] Installation des dependances...
    npm install --ignore-scripts
    echo.
)

echo  [INFO] Demarrage du serveur sur http://localhost:3000
echo  [INFO] Admin: admin / Admin2LMotors!
echo  [INFO] Appuyez sur Ctrl+C pour arreter
echo.

node server.js
