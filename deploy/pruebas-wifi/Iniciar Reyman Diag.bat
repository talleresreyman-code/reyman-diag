@echo off
rem Reyman Diag - programa de enlace (Wi-Fi y J2534). Doble clic para abrir.
rem PowerShell de 32 bits: las DLL J2534 (Autel V200...) son de 32 bits.
"%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0puente.ps1"
if errorlevel 1 pause
