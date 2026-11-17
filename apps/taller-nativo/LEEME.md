# Reyman Diag · app de taller instalable (iPad, iPhone y Android)

Es la misma Reyman Diag de https://diag.talleresreyman.es, pero instalada como app. Funciona así:

- **Abre la web por dentro.** Usa el mismo login que la App Reyman y se actualiza sola al actualizar el servidor. No hace falta compilar la app por cada cambio de la web.
- **Conecta directo con el adaptador**, sin portátil:
  - por Bluetooth: vLinker o WiCAN;
  - por Wi-Fi: WiCAN Pro, normalmente en 192.168.0.10:35000.
- **El Autel V200 y la VCMI siguen yendo por el portátil**, con el programa de enlace. En la app instalada esas opciones no salen.

## Enlace con la App Reyman
- La App Reyman (app «Reyman», `apps/reyman-nativo`) abre esta app con `reymandiag://abrir?ot=…&mat=…&vin=…`: sale la cinta «Desde la App Reyman» y, al leer el coche, se propone esa OT.
- «← App Reyman», arriba, vuelve a la App Reyman (`reyman://`).
- Usa el plugin `@capacitor/app` (empaquetado en `apps/taller/lib/nativo.js`).

## Cuándo hay que compilar la app
Solo hay que compilarla si cambia esta carpeta: permisos, plugins, icono o dirección del servidor.

| Plataforma | Cómo se compila | Dónde queda |
|---|---|---|
| iPad / iPhone | `.github/workflows/diag-ios.yml` | Se sube a TestFlight (app «Reyman Diag», es.talleresreyman.diag) |
| Android | `.github/workflows/diag-android.yml` | Se deja el APK en la rama `apk-diag` |

## Bluetooth y Wi-Fi dentro de la web
Los plugins de Capacitor se empaquetan en `apps/taller/lib/nativo.js` con `scripts/build-nativo.js`. La web solo carga ese archivo dentro de la app instalada.

Si se actualizan los plugins, se regenera así:

    cd apps/taller-nativo
    npm install
    npm run nativo

## Sin Internet
Si no hay conexión con el servidor, la app muestra `www/sin-conexion.html` con un botón «Reintentar».

Ojo con la red Wi-Fi del propio WiCAN: no tiene Internet. Para trabajar en el taller lo mejor es que el WiCAN esté conectado al Wi-Fi del taller (modo estación) y poner su dirección en la app.
