@echo off
rem Reyman Diag: programa de enlace (V200, VCMI y adaptador Wi-Fi). Se minimiza solo; la app se abre aparte.
rem PowerShell de 32 bits: las DLL J2534 de Autel son de 32 bits.
"%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente.ps1"
if errorlevel 1 pause
