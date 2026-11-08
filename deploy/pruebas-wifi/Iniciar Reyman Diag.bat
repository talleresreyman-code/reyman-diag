@echo off
rem Reyman Diag: programa de enlace (V200, VCMI y adaptador Wi-Fi). Se abre minimizado; la app se abre aparte.
start "Reyman Diag - enlace" /min "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente.ps1"
