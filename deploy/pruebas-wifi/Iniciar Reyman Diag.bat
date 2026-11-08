@echo off
rem Reyman Diag: programa de enlace (V200, VCMI y adaptador Wi-Fi). Se abre minimizado en la barra de tareas; la app se abre aparte.
rem Cierra antes cualquier enlace que siga abierto (también de versiones anteriores), para que no se queden dos a la vez.
taskkill /F /FI "WINDOWTITLE eq Reyman Diag*" >nul 2>&1
timeout /t 1 /nobreak >nul
start "Reyman Diag - enlace" /min "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente.ps1"
