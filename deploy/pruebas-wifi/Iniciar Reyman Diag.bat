@echo off
rem Reyman Diag: programa de enlace (V200, VCMI y adaptador Wi-Fi). La app se abre aparte.
rem PowerShell de 32 bits: las DLL J2534 de Autel son de 32 bits.
echo [%date% %time%] Iniciar Reyman Diag desde %~dp0>> "%~dp0enlace.log"
"%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente.ps1"
echo.
echo El programa de enlace se ha parado (codigo %errorlevel%). Mira enlace.log en esta carpeta.
pause
