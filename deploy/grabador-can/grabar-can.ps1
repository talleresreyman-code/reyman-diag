# Reyman Diag · Grabar el bus CAN de la toma OBD con una segunda interfaz J2534 (solo escucha).
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Host.UI.RawUI.WindowTitle = 'Reyman Diag · grabador CAN'
if ([IntPtr]::Size -ne 4) { Write-Host 'Abre este programa con «Grabar bus CAN.bat» (necesita PowerShell de 32 bits).' -ForegroundColor Red; Read-Host 'Pulsa Intro para salir'; exit }
Add-Type -Path (Join-Path $dir 'j2534puente.cs'), (Join-Path $dir 'grabador.cs')

$lista = @()
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\PassThruSupport.04.04', 'HKLM:\SOFTWARE\PassThruSupport.04.04' -ErrorAction SilentlyContinue) {
  $p = Get-ItemProperty $k.PSPath
  if ($p.FunctionLibrary -and (Test-Path $p.FunctionLibrary) -and -not ($lista | Where-Object { $_.DLL -eq $p.FunctionLibrary })) {
    $lista += [pscustomobject]@{ Nombre = $p.Name; DLL = $p.FunctionLibrary }
  }
}
Write-Host ''
Write-Host '  Reyman Diag · grabador del bus CAN (solo escucha, no envía nada al coche)' -ForegroundColor Cyan
Write-Host ''
if (-not $lista.Count) { Write-Host 'No hay interfaces J2534 instaladas.' -ForegroundColor Red; Read-Host 'Pulsa Intro para salir'; exit }
for ($i = 0; $i -lt $lista.Count; $i++) { Write-Host ('  ' + ($i + 1) + '. ' + $lista[$i].Nombre) }
Write-Host ''
$n = Read-Host '  Número de la interfaz que va en el cable en Y (la que GRABA, no la V200 de la tablet)'
$e = $lista[[int]$n - 1]
$vel = Read-Host '  Velocidad: Intro = 500 kbaud (casi todos los coches), o escribe 250'
$baud = if ($vel -eq '250') { 250000 } else { 500000 }
$b29 = (Read-Host '  ¿Bus de 29 bits? Intro = no (Ford, PSA, VW...), escribe s para sí') -eq 's'
$pin = Read-Host '  Pines del conector: Intro = 6 y 14 (diagnosis normal), 3 = pines 3 y 11, 1 = pines 1 y 9, 12 = pines 12 y 13'
$pines = switch ($pin) { '3' { 0x030B } '1' { 0x0109 } '12' { 0x0C0D } default { 0x060E } }
$ruta = Join-Path $dir ('bus-can-' + (Get-Date -Format 'yyyy-MM-dd-HH-mm') + '.csv')
Write-Host ''
Write-Host ('  Interfaz: ' + $e.Nombre + ' · ' + ($baud / 1000) + ' kbaud · ' + $(if ($b29) { '29' } else { '11' }) + ' bits · pines ' + ($pines -shr 8) + ' y ' + ($pines -band 0xFF))
Write-Host '  1. Pon el contacto. 2. Pulsa Intro aquí para empezar a grabar.' -ForegroundColor Yellow
Write-Host '  3. Haz el diagnóstico con la tablet Autel. 4. Pulsa Intro otra vez para parar (máximo 15 minutos).' -ForegroundColor Yellow
Read-Host '  Intro para empezar' | Out-Null
try {
  $pt = New-Object PassThruDll($e.DLL)
  $parar = [Func[bool]] { [Console]::KeyAvailable }
  $total = [GrabadorCan]::Grabar($pt, [uint32]$baud, $b29, [uint32]$pines, $ruta, 900, $parar)
  while ([Console]::KeyAvailable) { [void][Console]::ReadKey($true) }
  Write-Host ''
  Write-Host ''
  Write-Host ('  Grabado: ' + $total + ' tramas en ' + $ruta) -ForegroundColor Green
  if ($total -eq 0) { Write-Host '  No ha llegado nada. Haz una FOTO de esta ventana y mándasela a Claude.' -ForegroundColor Yellow }
} catch {
  Write-Host ''
  Write-Host ('  Error: ' + $_.Exception.Message) -ForegroundColor Red
}
Write-Host '  El archivo queda en esta carpeta de Drive. Avisa a Claude.'
Read-Host '  Pulsa Intro para salir' | Out-Null
