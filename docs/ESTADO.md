# Reyman Diag · Reyman Connect · estado (08/11/2026, v0.4.4)

Base: `reyman-diag-v0.1.zip` (el código de la v0.2 con el Wi-Fi no estaba disponible: la conexión Wi-Fi se ha rehecho a partir del programa de enlace).

## Hecho en la v0.3

### 1. Estructura nueva (núcleo común + dos apps)
- `packages/obd-core`: el motor OBD sale de la app de taller y lo usan las dos apps.
- `apps/taller`: Reyman Diag, igual que antes. Importa el núcleo con un *import map*; el servidor lo sirve en `/core/`.
- `apps/cliente`: Reyman Connect (nueva).
- Docker y service worker actualizados. Probado en el navegador con el servidor: la app de taller carga el núcleo sin errores y lee el simulador.

### 2. Conexiones
- **Wi-Fi** (`transport/wifi.js`): mismo protocolo que el programa de enlace (`PUENTE_OK` / `PUENTE_ERROR`). Botón Wi-Fi en Reyman Diag, activo solo en `localhost` (con el programa de enlace), con dirección y puerto editables.
- **Bluetooth nativo** (`transport/ble-nativo.js`): para la app de cliente en iPhone y Android (plugin de Capacitor). Elige escritura y notificación del mismo servicio, trocea en 20 bytes y recuerda el adaptador.

### 3. Batería (`bateria.js`)
- Reposo (estado y % de carga), carga del alternador, curva de arranque (mínimo: buena ≥ 10,0 V, justa ≥ 9,6 V, débil por debajo), historial con tendencia semanal y avisos (también de invierno).
- Compensación de 0,1 V por la caída en la toma OBD. Tipo de batería convencional o AGM.
- Simulador: motor parado, arranque con caída de tensión y batería configurable.

### 4. Grabación (`grabacion.js`)
- Formato común `reyman-grabacion` v1 para pruebas de carretera y grabador; conversión desde las sesiones actuales de Reyman Diag.
- CSV para Excel (`;` y coma decimal) de ida y vuelta: es el formato que escribirá el firmware del WiCAN Pro en la SD.
- **Grabador** con memoria circular: dispara por avería nueva, botón del conductor o caída brusca de tensión; guarda los segundos de antes y de después y junta disparos seguidos.
- Simulador de fallos intermitentes (`_inyectarFallo`).

### 5. Reyman Connect (`apps/cliente`)
- Pantallas Inicio, Averías, Batería (con prueba de arranque y gráfica), Mantenimiento y Mi taller. Ver `apps/cliente/LEEME.md`.
- Gravedad de cada avería para el conductor (`obd/gravedad.js`) y mantenimiento por km y fechas (`mantenimiento.js`).
- Capacitor 8 configurado (`es.talleresreyman.connect`). Demo en un solo archivo probada en Chrome a tamaño de móvil, en claro y oscuro.
- Servidor: rutas `/api/connect/…` con consentimiento, límite por IP, CORS solo para la app y tabla `connect_avisos` (ver `docs/INTEGRACION.md`).

### 6. Paquete de pruebas Wi-Fi v0.3 (08/11/2026)
- `npm run` no hace falta: `node scripts/build-pruebas.js` genera `dist/Reyman_Diag_WiFi/` (app en un solo archivo en modo pruebas + programa de enlace + LEEME). Los archivos del enlace viven en `deploy/pruebas-wifi/`.
- Modo pruebas: adaptador real, sin servidor, registro completo descargable (comunicación + lecturas + pruebas de batería) con versión.
- Reyman Diag: botón **Prueba de batería** (reposo y curva de arranque con nota del estado real) y el estado de la barra superior vuelve a la pantalla de conexión.
- Probado de punta a punta con un enlace y un adaptador Wi-Fi simulados: conexión, lectura, batería y descarga del registro.

### 7. Batería automática y alternador (v0.3.2, 08/11/2026)
- Programa de enlace corregido: `AcceptWebSocketAsync` recibía "" en vez de null (error en Windows). Pendiente de confirmar en el portátil.
- Registro automático de tensión cada 30 s mientras hay adaptador (recuadro «Batería» en Vehículo; va al registro descargable).
- Prueba de alternador en dos pasos (ralentí sin consumo / luces + luneta + ventilador a ~2.000 rpm) con `evaluarAlternador` en el núcleo; tiene en cuenta la carga inteligente.
- Botones «Batería y alternador» y «Descargar registro» en Vehículo; el panel de conexión pasa arriba en «Conectar».
- Pendiente: llevar el registro automático y la prueba de alternador a Reyman Connect.

### 8. Primera prueba real (08/11/2026, coche de José) → v0.3.3
- Coche: PSA gasolina (calibración 9805263499), CAN 11 bits 500 kbaud, una centralita (7E8), sin averías, apto ITV.
- **Programa de enlace:** funciona en Windows con la corrección de la v0.3.1.
- **Bastidor:** el coche responde NO DATA al modo 09 PID 02 (no lo da por OBD genérico). Tampoco da km (sin PID A6). El informe ahora dice «No lo da por OBD».
- **Batería:** reposo 12,3 V (frío) y 12,7–12,9 V recién apagado; arranque con pico de 9,2–9,3 V durante ~0,1 s y meseta de 10,9–11,0 V durante ~0,8 s → batería buena.
  - Corregido: el análisis usaba el pico y decía «débil». Ahora evalúa la meseta (mediana mientras gira el motor de arranque, sin los primeros 150 ms) e informa el pico aparte. Los dos arranques reales están en `test/datos/arranques-reales.json` como prueba.
  - Aviso de carga superficial si se mide el reposo menos de 20 min después de apagar el motor.
- **Alternador:** 14,6 V en ralentí y 14,5 V con consumo a ~2.000 rpm → correcto.
- El clon ELM327 responde a ATRV cada ~60–80 ms: suficiente para ver la curva de arranque.

### 9. MaxiVCI V200 por J2534 → v0.4.0 (08/11/2026)
- Comunicación real confirmada con la V200 de José (firmware V1.45, DLL V2.02.14, API 04.04, `C:\Windows\SysWOW64\VCIV200432.dll`). Solo CAN (11/29 bits, 500/250 kbaud).
- **Enlace:** `deploy/pruebas-wifi/j2534puente.cs` (C# 5, se compila en el PowerShell de 32 bits) + ruta `/j2534` en `puente.ps1`. Lanzador único «Iniciar Reyman Diag.bat» (PowerShell de SysWOW64).
- **Transporte** `transport/j2534.js`: emula un ELM327 sobre J2534 (la app no cambia), detecta protocolo, filtros ISO-TP y orden propia `STSCAN` (escaneo seguro del bus: escucha 1,5 s y nunca transmite en un ID que ya usa el coche).
- **UDS** `obd/uds.js`: nombre, referencia, bastidor (22 F197/F187/F190), averías 19 02 (activa/pendiente/confirmada) y borrado 14 FFFFFF con reintento en sesión extendida. Con un ELM normal prueba solo 7E0–7E7.
- **Reyman Diag:** botón «MaxiVCI (J2534)», recuadro «Todas las centralitas» en Averías (escanear, borrar una o todas, registrado con motivo), bastidor desde UDS si el OBD no lo da, apartado «Resto de centralitas» en el informe. El simulador también tiene centralitas UDS.
- Probado sin Windows: enlace real compilado con Mono + coche simulado (4 centralitas, ID ocupados, respuestas «pendiente», airbag que exige sesión extendida) y la app en Chromium por WebSocket.
- **Primera prueba real v0.4.0** (híbrido, 7E8/7EC/7EE, 47.249 km por PID A6): el escaneo encontró 9 centralitas en ~20 s (6F0, 726, 746, 750, 7C7, 7D0, 7E0, 7E4, 7E6), sin tráfico propio en el OBD. Todas las respuestas de una trama llegaban; **ninguna de varias tramas** (09 02, 09 04, 09 0A, 22 F190, listas 19 02) → el control de flujo de la V200 en ISO 15765 no le vale a las centralitas.
- **v0.4.1:** el ISO-TP lo hace el enlace sobre CAN crudo (orden `isotp`): control de flujo de 8 bytes enviado al instante, varias centralitas a la vez. El coche simulado ahora exige control de flujo de 8 bytes. Pendiente de probar en el coche.
- Esas centralitas contestan 7F 22 31 a 22 F197/F187: no usan los identificadores estándar; habrá que poner nombres por dirección y marca.

### Pruebas
### 10. Kuga confirmado y modo 06 → v0.4.2 (08/11/2026)
- v0.4.1 en el Ford Kuga 2023 híbrido (WF0FXXWPMHPE00628): bastidor por OBD y por 4 centralitas, nombres 09 0A (ECM-EngineControl, BECM-B+EnergyCtrl, HPCM-HybridPtCtrl) y calibraciones; 9 centralitas UDS con nombre Ford (tabla por dirección del manual de taller), listas de averías leídas, sin averías. PID 5B = 53,7 % (comprobar con Autel si es salud o carga).
- Readiness juntando todas las centralitas OBD (antes salía la híbrida con 1 monitor). Año de bastidor Ford Europa por la posición 11.
- **Modo 06** (`obd/modo06.js`, `Obd.modo06()`): MID/TID/UASID con escalas J1979, por centralita, fuera de límites y «cerca del límite» (<10 % del rango). En Pre-ITV (botón) y en el informe del taller. Simulador con catalizador justo fuera de límites.
- **Grabador_CAN** (`deploy/grabador-can`): segunda interfaz J2534 (VCMI) en cable en Y, solo escucha, CSV `ms;id;datos;estado`, para ver qué direcciones y DID usa la tablet Autel (ABS, airbag, cuadro detrás de la pasarela).
- Pendiente: módulos detrás de la GWM (otros pines del conector, J1962_PINS), DID de Ford (batería híbrida), datos en vivo por centralita.

### 11. Grabaciones de la Autel y batería híbrida Ford → v0.4.3 (08/11/2026)
- Grabador CAN con VCMI en cable en Y: la Autel en modo Ford sondea con 22 D100 y lee F188/F113; en los pines 6/14 contestan las mismas 9 centralitas (ABS 760 no). En modo OBD pide lo mismo que Reyman Diag (incl. modo 06). Detalle en `docs/FORD_KUGA_HIBRIDO.md`.
- Modo 06 real en el Kuga: 29 pruebas del motor, todas bien. «Cerca del límite» corregido (frente al límite que importa, <10 %).
- Batería 12 V: 15 V con motor parado = carga del DC-DC (híbrido READY); máximo de carga 15,3 V.
- Datos en vivo J2534 ~4× más rápidos (recuerda cuántas centralitas contestan); aviso si la V200 se desconecta del USB.
- **Batería de alta tensión Ford** (`marcas/ford.js`): BECM 7E4, DID 4801 carga, 480D tensión, 4840/4841 celdas, DD01 km; recuadro en Vehículo con «En vivo» cada 2 s, registro e informe. Simulador «Ford Kuga 2.5 FHEV».
- Pendiente: grabación con pines 3/11 (ABS, airbag, cuadro); probar la batería híbrida en el coche real.

### 12. Publicado en el VPS → v0.4.4 (08/11/2026)
- Repositorio `talleresreyman-code/reyman-diag`; en el VPS en `/opt/reyman-diag` (llave de despliegue `github-diag`), sin puerto propio: el Caddy de n8n lo publica en https://diag.talleresreyman.es (`deploy/publicar-caddy.sh`). Actualizar: `cd /opt/reyman-diag && deploy/actualizar.sh`.
- App Reyman (commit 8a9e667): cookie de sesión con dominio `.talleresreyman.es`, `?volver=`, permisos `diag.*` (migración 039), pestaña «Diagnosis», `GET /api/diag/ots` con clave `reyman-diag`.
- La app online usa la V200 y el Wi-Fi si «Iniciar Reyman Diag» está abierto en el portátil (`/estado` del enlace con CORS y red privada). Con internet el enlace abre la app online; sin internet, la de pruebas. Funciona en el portátil de José.
- Pendiente: piloto en el taller (vLinker Bluetooth en tablet, V200 en portátil), comprobar guardado en OT, correo e informe al cliente, copia de la base `diag` a OneDrive.

### 13. Base OBD completa (OBDb) → v0.4.7 (08/11/2026)
- **Todos los PID del estándar** (205 PID, 1.095 datos) desde la base abierta OBDb «SAEJ1979» (CC BY-SA 4.0), copiada en `data/obdb/` y traducida al español con `scripts/generar-sae-pids.py` → `packages/obd-core/src/obd/sae-pids.js` (generado, no editar). Errata corregida: avance de inyección (PID 5D) con −210.
- **Decodificador genérico** (`obd/senales.js`): bits desde el bit alto del byte A, escala, signo, «no disponible», listas de texto y los bits de «dato soportado» que trae cada PID (no se enseña lo que el coche no tiene). Presiones de rail en bar. `decodificarPid` mantiene la lista corta y añade `senales`.
- **Datos en vivo por grupos** (Básico, Mezcla, Lambda, Inyección y EGR, Turbo, Escape/DPF, AdBlue/SCR, Híbrido, Par y cambio, Contadores) solo con lo soportado; un PID con varios datos se pide una vez. Botón **«Foto de todos los datos»** (una lectura de cada PID soportado, con la centralita que contesta), también en el informe del taller. La grabación guarda por dato (`0C.RPM`).
- Quitado el PID 7C de la lista corta: estaba mal (el estándar lleva byte de soportados delante).
- **Servicio 09 completo** (`obd/modo09.js`, Pre-ITV): calibraciones con su CVN, nº de serie y contadores de uso de los monitores (IUMPR, 09 08 gasolina / 09 0B diésel) con ratio y semáforo; en el informe del taller.
- **OBD sobre UDS (SAE J1979-2)**: si el coche no contesta al 01 00, se prueba 22 F400 y se usa 22 F4xx (PID), 22 F8xx (infotipos), 19 42 33 (confirmadas/pendientes, con FTB), 19 55 33 (permanentes) y 14 FF FF 33 (borrar). Aún no: freeze frame (19 04) y modo 06 (22 F6xx). Simulador con `obdUds: true`.
- Pendiente: probar la foto completa y el servicio 09 en el Kuga real y en un diésel con DPF/AdBlue.

### 14. Visor de datos grabados → v0.4.8 (08/11/2026)
- Nueva pantalla **«Datos grabados»** (desde Conectar, sin coche, o desde «En vivo»): lista de pruebas de carretera guardadas por matrícula u OT (`GET /api/sesiones`, `GET /api/sesiones/:id`) y **«Abrir archivo»** CSV/JSON: grabador propio (`reyman-grabacion`), CSV del servidor, CSV de Excel (coma decimal) o de otros equipos (columna de tiempo en s, ms o hh:mm:ss y columnas «Nombre (unidad)»).
- Gráfica (`apps/taller/lib/visor-grafica.js`, modelo en `packages/obd-core/src/visor.js`): una pista por dato con el mismo eje de tiempo, hasta 8 a la vez; cursor con todos los valores; zoom con rueda, arrastrando una zona, botones o dos dedos; mapa de toda la grabación; agrupa por píxel guardando mín./máx. (no se pierden picos).
- Tabla de valores del tramo visible (en el cursor, mínimo, máximo, media; tocar mín./máx. lleva a ese instante). Marcas: botón **«Marcar momento»** mientras se graba en «En vivo» y «Añadir marca en el cursor» en el visor. Descargar CSV (lo visible o todo) y JSON del visor.
- Las sesiones **se quedan en la base** aunque n8n las copie a OneDrive (antes se vaciaban). Migración `003_sesiones_visor.sql` (columna `eventos`). Las antiguas ya vaciadas salen como «Solo en OneDrive».
- Modo demostración con una prueba de carretera de ejemplo (tirón a 1:35).
- **Copia a OneDrive** (flujo n8n «Reyman Diag · copia nocturna de grabaciones a OneDrive», id MU5hnh7TBvDlrQE2): cada noche a las 02:47 pide `http://reyman-diag:3020/api/ingest/sesiones` (red interna de Docker, cabecera `x-api-key` = `DIAG_INGEST_KEY` del `.env` del VPS, credencial n8n «Reyman Diag (copia a OneDrive)»), sube cada CSV (formato Excel, con marcas) a `01_TALLERES REYMAN/DIAGNOSIS OBD/<año>/1-A-<OT> <matrícula>/AAAAMMDD_HHMM_Prueba de carretera_<matrícula>.csv` (sin OT: `SIN OT/<matrícula>`) y la marca como copiada. Sin IA, sin coste.

### 15. ¿Software original? Resultado del CVN → v0.4.9 (09/11/2026)
- En Pre-ITV, al leer el servicio 09, cada calibración (CALID) sale con **No modificado** (verde), **Modificado** (rojo), **Dudoso** (ámbar) o **Sin referencia** (gris), también en el informe del taller.
- La lista oficial de CVN de los fabricantes no es pública, así que la referencia sale de (por orden): una referencia «original de fábrica» marcada a mano (botón «Es original de fábrica», solo administración, `diag.actualizar`); el mismo coche leído antes (si el CVN ha cambiado → modificado); otros coches del taller con el mismo software (igual → verde; distinto de 2 o más coches → rojo; mezcla → dudoso). Cada lectura se apunta (`diag_cvn`, `diag_cvn_ref`, migración 004).
- Lógica en `packages/obd-core/src/cvn.js`; `POST /api/cvn/comprobar` y `POST /api/cvn/referencia`.
- Límite: un programador que deja el CVN original no se detecta por este método.
- Enlace (`puente.ps1`): vuelto a la versión probada sin el reinicio automático al cambiar de interfaz; «Iniciar Reyman Diag» apunta en `enlace.log` cada arranque y no cierra la ventana si el programa se para.

### 16. Grabación automática de cada sesión de diagnóstico → v0.4.10 (09/11/2026)
- Desde «Conectar» hasta «Desconectar», la app guarda sola la sesión completa: toda la comunicación, todas las lecturas y pruebas (UDS, modo 06, servicio 09, batería, batería AT, foto de datos) y **dos informes HTML (taller y cliente)**. Constante `GRABACION_AUTO` en `apps/taller/app.js`.
- Se guarda con la primera lectura (el nombre lleva fecha, hora y matrícula o bastidor: `AAAAMMDD_HHMMSS_<coche>`), 5 s después de cada lectura o prueba nueva, cada minuto si hay comunicación nueva y al desconectar (o si falla la conexión).
- Destinos: 1) portátil, con el programa de enlace: `REYMAN DIAG\Sesiones de diagnóstico\<sesión>\registro.json, informe-taller.html, informe-cliente.html` (fuera de la carpeta de la versión). Con la V200 o el Wi-Fi conectados el enlace está ocupado, así que ahí se guarda al desconectar. 2) servidor (app online): tabla `diag_registros` (migración 005), `POST /api/registros`; n8n la copia cada noche a OneDrive `DIAGNOSIS OBD/<año>/1-A-<OT> <matrícula>/Sesión <id>/` (Informe taller, Informe cliente, Registro completo); si se vuelve a guardar después de copiarla, se copia otra vez.
- Enlace: endpoint `POST /guardar` (solo nombres seguros, .json y .html, máx. 60 MB) y al arrancar cierra cualquier otro PowerShell que esté ejecutando un `puente.ps1` (antes no los encontraba porque el puerto lo tiene el proceso System → «conflicto con un registro existente»).

### Pruebas
- **102 pruebas automáticas.**

## Pendiente

### Con el material (WiCAN Pro y vLinker)
1. Pruebas reales del motor en 3–4 coches (Wi-Fi, vLinker y WiCAN Pro) y revisión de los registros.
2. Identificar el servicio BLE del WiCAN Pro y añadirlo a `SERVICIOS_BLE` si hace falta.
3. Ver qué graba ya el WiCAN Pro en la SD (plan B del grabador) y empezar el firmware de grabación.
4. Prueba de arranque real con una batería buena y otra floja para ajustar los umbrales.

### Desarrollo
5. Módulo **Grabador** en Reyman Diag: importar CSV/JSON, gráficas con la marca del fallo, recorte e IA.
6. Reyman Connect: probar en Android e iPhone (Android Studio y Mac con Xcode), iconos, avisos locales de revisión e ITV.
7. Flujo n8n `N8N_CONNECT_URL` → Telegram del taller, y pestaña «Avisos de clientes» en la App Reyman.
8. Textos legales de Reyman Connect: política de privacidad y consentimiento final.

### Ya pendiente de la v0.2
9. Crear el repositorio en GitHub, DNS `diag`, proxy HTTPS e instalación en el VPS (ver `README.md`).
10. Integración con App Reyman (`docs/INTEGRACION.md`) y manuales por rol.
