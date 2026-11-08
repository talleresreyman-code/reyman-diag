# Reyman Diag · programa de enlace para Windows
# - Sirve la app en http://localhost:35001 (el navegador la trata como segura: también funcionan Bluetooth y puerto COM)
# - En /ws hace de puente entre la app (WebSocket) y el adaptador ELM327 Wi-Fi (TCP, normalmente 192.168.0.10:35000)
# - En /j2534 hace de puente con una interfaz J2534 PassThru (Autel MaxiVCI V200, VCMI...) conectada por USB.
#   Usa j2534puente.cs (junto a este archivo). Necesita PowerShell de 32 bits: ábrelo con «Iniciar Reyman Diag».
# No instala nada. Solo escucha en este ordenador (localhost). Para cerrarlo, cierra esta ventana.
# Requiere Windows 8 o posterior (PowerShell 5.1 viene con Windows 10/11).

param([int]$Puerto = 35001)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appFile = Join-Path $dir 'reyman-diag.html'
$Host.UI.RawUI.WindowTitle = 'Reyman Diag · enlace (Wi-Fi y J2534)'

function Log($t) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $t) }

# Solo se permite conectar a direcciones de red local (el adaptador), nunca a internet
function DireccionPermitida([string]$ip) {
  return ($ip -match '^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$')
}

function EnviarTexto($ws, [string]$t) {
  $b = [Text.Encoding]::ASCII.GetBytes($t)
  $seg = [ArraySegment[byte]]::new($b)
  $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
}

# --- J2534 ---
$script:j2534Listo = $false
$script:j2534Motivo = ''
if ([IntPtr]::Size -ne 4) {
  $script:j2534Motivo = 'Para usar la interfaz J2534 abre el programa con «Iniciar Reyman Diag» (PowerShell de 32 bits).'
} else {
  try {
    Add-Type -Path (Join-Path $dir 'j2534puente.cs') -ErrorAction Stop
    $script:j2534Listo = $true
  } catch {
    $script:j2534Motivo = 'No se ha podido preparar el acceso J2534: ' + $_.Exception.Message
  }
}

# Interfaces J2534 instaladas (registro de Windows), en orden de preferencia: la indicada, V200, VCMI2, VCMI y el resto.
function ElegirDllJ2534([string]$preferida) {
  $claves = @('HKLM:\SOFTWARE\PassThruSupport.04.04', 'HKLM:\SOFTWARE\WOW6432Node\PassThruSupport.04.04')
  $disp = @()
  foreach ($c in $claves) {
    if (Test-Path $c) {
      foreach ($k in Get-ChildItem $c) {
        $p = Get-ItemProperty $k.PSPath
        if ($p.FunctionLibrary) { $disp += [pscustomobject]@{ Nombre = [string]$p.Name; DLL = [string]$p.FunctionLibrary } }
      }
    }
  }
  $disp = @($disp | Sort-Object DLL -Unique)
  $patrones = @()
  if ($preferida) { $patrones += [regex]::Escape($preferida) }
  $patrones += @('^V200$', 'VCMI2', 'VCMI')
  $orden = @()
  foreach ($pat in $patrones) {
    foreach ($e in @($disp | Where-Object { $_.Nombre -match $pat })) { if (-not ($orden | Where-Object { $_.DLL -eq $e.DLL })) { $orden += $e } }
  }
  foreach ($e in $disp) { if (-not ($orden | Where-Object { $_.DLL -eq $e.DLL })) { $orden += $e } }
  return ,$orden
}

function AtenderJ2534($ctx) {
  $sinSubprotocolo = [System.Management.Automation.Language.NullString]::Value
  $ws = $ctx.AcceptWebSocketAsync($sinSubprotocolo).GetAwaiter().GetResult().WebSocket
  $puente = $null
  $listo = $false
  try {
    if (-not $script:j2534Listo) { EnviarTexto $ws ('PUENTE_ERROR: ' + $script:j2534Motivo); return }
    $lista = ElegirDllJ2534 $ctx.Request.QueryString['dll']
    if (-not $lista.Count) { EnviarTexto $ws 'PUENTE_ERROR: No hay ninguna interfaz J2534 instalada en este ordenador. Instala Maxi PC Suite de Autel.'; return }
    # Se usa la primera que esté enchufada (la que se deja abrir): V200, VCMI2, VCMI...
    $e = $null
    $ultimo = ''
    foreach ($c in $lista) {
      try {
        $p = New-Object Puente (New-Object PassThruDll $c.DLL)
        $r = $p.Atender('0 abrir')
        if ($r -like '0 OK*') { $puente = $p; $e = $c; break }
        $ultimo = $c.Nombre + ': ' + $r
      } catch { $ultimo = $c.Nombre + ': ' + $_.Exception.Message }
    }
    if (-not $puente) { Log ('J2534: ninguna interfaz responde (' + $ultimo + ')'); EnviarTexto $ws 'PUENTE_ERROR: No se encuentra ninguna interfaz Autel enchufada por USB (V200, VCMI...). Comprueba el cable y que no la esté usando la tablet o Maxi PC Suite.'; return }
    Log ('J2534: ' + $e.Nombre + ' (' + $e.DLL + ')')
    EnviarTexto $ws ('PUENTE_OK ' + $e.Nombre)
    $listo = $true
    $buf = New-Object byte[] 65536
    $ct = [Threading.CancellationToken]::None
    while ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {
      $sb = New-Object Text.StringBuilder
      do {
        $r = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct).GetAwaiter().GetResult()
        if ($r.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { return }
        [void]$sb.Append([Text.Encoding]::ASCII.GetString($buf, 0, $r.Count))
      } while (-not $r.EndOfMessage)
      foreach ($linea in $sb.ToString().Split("`n")) {
        if ($linea.Trim()) { EnviarTexto $ws ($puente.Atender($linea)) }
      }
    }
  } catch {
    Log ('J2534: ' + $_.Exception.Message)
    if (-not $listo) { try { EnviarTexto $ws ('PUENTE_ERROR: ' + $_.Exception.Message) } catch { } }
  } finally {
    if ($puente) { $puente.Cerrar() }
    try {
      if ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'fin', [Threading.CancellationToken]::None).Wait(2000) | Out-Null
      }
    } catch { }
    $ws.Dispose()
    Log 'J2534: enlace cerrado. Esperando a la app...'
  }
}

function AtenderWebSocket($ctx) {
  $q = $ctx.Request.QueryString
  $ipObd = if ($q['host']) { $q['host'] } else { '192.168.0.10' }
  $puertoObd = 35000
  if ($q['port']) { [int]::TryParse($q['port'], [ref]$puertoObd) | Out-Null }

  # PowerShell convierte $null en "" al llamar a .NET: NullString pasa un null de verdad (sin subprotocolo)
  $sinSubprotocolo = [System.Management.Automation.Language.NullString]::Value
  $wsctx = $ctx.AcceptWebSocketAsync($sinSubprotocolo).GetAwaiter().GetResult()
  $ws = $wsctx.WebSocket
  $tcp = $null
  try {
    if (-not (DireccionPermitida $ipObd)) {
      EnviarTexto $ws "PUENTE_ERROR: La dirección $ipObd no es de red local."
      return
    }
    Log "Conectando con el adaptador $ipObd`:$puertoObd ..."
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.NoDelay = $true
    $intento = $tcp.ConnectAsync($ipObd, $puertoObd)
    if (-not $intento.Wait(5000) -or -not $tcp.Connected) {
      Log 'No responde el adaptador.'
      EnviarTexto $ws "PUENTE_ERROR: No responde el adaptador en $ipObd`:$puertoObd. Conecta el portátil a la red Wi-Fi del adaptador (suele llamarse WiFi_OBDII) y comprueba que tiene luz."
      return
    }
    Log 'Adaptador conectado.'
    EnviarTexto $ws 'PUENTE_OK'
    $ns = $tcp.GetStream()
    $bufW = New-Object byte[] 4096
    $bufT = New-Object byte[] 4096
    $ct = [Threading.CancellationToken]::None
    $tW = $ws.ReceiveAsync([ArraySegment[byte]]::new($bufW), $ct)
    $tT = $ns.ReadAsync($bufT, 0, $bufT.Length)
    while ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {
      $i = [Threading.Tasks.Task]::WaitAny([Threading.Tasks.Task[]]@($tW, $tT), 1000)
      if ($i -eq 0) {
        if ($tW.IsFaulted) { break }
        $r = $tW.Result
        if ($r.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { break }
        $ns.Write($bufW, 0, $r.Count)
        $ns.Flush()
        $tW = $ws.ReceiveAsync([ArraySegment[byte]]::new($bufW), $ct)
      } elseif ($i -eq 1) {
        if ($tT.IsFaulted) { Log 'Se ha perdido la conexión con el adaptador.'; break }
        $n = $tT.Result
        if ($n -le 0) { Log 'El adaptador ha cerrado la conexión.'; break }
        $seg = [ArraySegment[byte]]::new($bufT, 0, $n)
        $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Binary, $true, $ct).Wait()
        $tT = $ns.ReadAsync($bufT, 0, $bufT.Length)
      }
    }
  } catch {
    Log ("Error en el enlace: " + $_.Exception.Message)
  } finally {
    if ($tcp) { $tcp.Close() }
    try {
      if ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'fin', [Threading.CancellationToken]::None).Wait(2000) | Out-Null
      }
    } catch { }
    $ws.Dispose()
    Log 'Enlace cerrado. Esperando a la app...'
  }
}

function ServirApp($ctx) {
  $res = $ctx.Response
  try {
    $ruta = $ctx.Request.Url.AbsolutePath
    if ($ruta -eq '/estado') {
      # Para la app online (diag.talleresreyman.es): saber que el enlace está abierto en este ordenador
      $origen = $ctx.Request.Headers['Origin']
      if ($origen -match '^https://([a-z0-9-]+\.)*talleresreyman\.es$' -or $origen -match '^http://(localhost|127\.0\.0\.1)(:\d+)?$') {
        $res.Headers.Add('Access-Control-Allow-Origin', $origen)
        $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')
        $res.Headers.Add('Access-Control-Allow-Methods', 'GET')
        $res.Headers.Add('Vary', 'Origin')
      }
      if ($ctx.Request.HttpMethod -eq 'OPTIONS') { $res.StatusCode = 204; return }
      $j = '{"ok":true,"programa":"Reyman Diag enlace","j2534":' + $(if ($script:j2534Listo) { 'true' } else { 'false' }) + '}'
      $b = [Text.Encoding]::UTF8.GetBytes($j)
      $res.ContentType = 'application/json; charset=utf-8'
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $b.Length
      $res.OutputStream.Write($b, 0, $b.Length)
    } elseif ($ruta -eq '/' -or $ruta -eq '/index.html') {
      $b = [IO.File]::ReadAllBytes($appFile)
      $res.ContentType = 'text/html; charset=utf-8'
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $b.Length
      $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}

if (-not (Test-Path $appFile)) { Write-Host "Falta el archivo reyman-diag.html junto a este programa."; Read-Host 'Pulsa Intro para salir'; exit 1 }

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Puerto/")
try { $l.Start() } catch {
  Write-Host ''
  Write-Host "No se ha podido abrir el puerto $Puerto en este ordenador: $($_.Exception.Message)"
  Write-Host 'Puede que ya esté abierto (mira si hay otra ventana del enlace) o que Windows pida permisos de administrador:'
  Write-Host 'en ese caso, clic derecho en «Iniciar Reyman Diag Wi-Fi» > Ejecutar como administrador.'
  Read-Host 'Pulsa Intro para salir'
  exit 1
}

Write-Host ''
Write-Host '  Reyman Diag · enlace en marcha (Wi-Fi y J2534)' -ForegroundColor Cyan
Write-Host "  Abre la app Reyman Diag (diag.talleresreyman.es). Sin internet: http://localhost:$Puerto"
Write-Host '  1. Conecta el portátil a la red Wi-Fi del adaptador (WiFi_OBDII o parecido).'
Write-Host '  2. En la app, pulsa «Wi-Fi».'
Write-Host '  3. Interfaz Autel por USB: en la app, pulsa «Autel V200 (J2534)» o «Autel VCMI (J2534)».'
if ($script:j2534Listo) { Write-Host '  J2534: preparado.' -ForegroundColor Green } else { Write-Host ('  J2534: ' + $script:j2534Motivo) -ForegroundColor Yellow }
Write-Host '  No cierres esta ventana mientras uses la app.'
Write-Host ''
# No se abre ninguna página: la app se abre a mano (instalada como aplicación, diag.talleresreyman.es).
# Si hace falta la versión sin internet (Wi-Fi del adaptador): http://localhost:35001

while ($l.IsListening) {
  try {
    $ctx = $l.GetContext()
    if ($ctx.Request.IsWebSocketRequest -and $ctx.Request.Url.AbsolutePath -eq '/ws') { AtenderWebSocket $ctx }
    elseif ($ctx.Request.IsWebSocketRequest -and $ctx.Request.Url.AbsolutePath -eq '/j2534') { AtenderJ2534 $ctx }
    else { ServirApp $ctx }
  } catch {
    Log ("Error: " + $_.Exception.Message)
  }
}
