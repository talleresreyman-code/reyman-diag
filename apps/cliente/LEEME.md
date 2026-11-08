# Reyman Connect · app de cliente

App para particulares (iPhone y Android) que se conecta al coche con un adaptador OBD Bluetooth LE. Gratis, sin cuenta y sin suscripción: los datos se quedan en el móvil y solo se envían al taller si el cliente lo vincula y lo acepta.

## Qué hace (versión 0.1)

| Pantalla | Qué enseña |
|---|---|
| **Inicio** | Coche (marca y año por el bastidor, matrícula, km), botón «Comprobar mi coche», semáforo de averías, batería y mantenimiento, avisos. |
| **Averías** | Cada código con su explicación y una gravedad para el conductor: *Para en cuanto puedas* / *Ve al taller pronto* / *Revísalo sin prisa*. Botón para enviarlas al taller y para apagar el testigo (con aviso de que no repara nada). |
| **Batería** | Tensión en reposo con % de carga, carga del alternador, **prueba de arranque** con gráfica, historial y avisos (también los de invierno). Tipo de batería convencional o AGM. |
| **Mantenimiento** | Km del coche (por OBD o estimados por ritmo), última revisión, intervalos, ITV, avisos. |
| **Mi taller** | Vincular por código (`REYMAN`) con consentimiento, llamar o escribir por WhatsApp, enviar el estado del coche y pedir cita. |

Todo usa el núcleo común `packages/obd-core` (el mismo motor que Reyman Diag).

## Compilar y probar

```bash
cd apps/cliente
npm install
npm run build        # www/ → lo que empaqueta Capacitor
npm run demo         # dist/reyman-connect-demo.html: un solo archivo, modo demostración con simulador
```

La demo se abre en cualquier navegador. En Chrome de Android o del ordenador, `www/index.html` servido por HTTPS también conecta con un adaptador por Bluetooth web.

## Sacar la app en Android e iPhone (Capacitor)

Hace falta **Android Studio** (para Android) y un **Mac con Xcode** (para iPhone). Las plataformas nativas no están en el repositorio: se crean una vez.

```bash
cd apps/cliente
npm install
npm run build
npx cap add android
npx cap add ios
npx cap sync
npx cap open android     # o: npx cap open ios
```

### Permisos de Bluetooth

Comprobar contra el README del plugin `@capacitor-community/bluetooth-le` de la versión instalada.

**Android** (`android/app/src/main/AndroidManifest.xml`, dentro de `<manifest>`):

```xml
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

La app no usa la ubicación (`androidNeverForLocation: true`).

**iPhone** (`ios/App/App/Info.plist`):

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Reyman Connect usa el Bluetooth para conectar con el adaptador OBD de tu coche.</string>
```

## Adaptadores

- Tiene que ser **Bluetooth LE** (el Bluetooth clásico no funciona en iPhone). Probados en el simulador: vLinker (servicio Vgate) y ELM327 BLE genéricos (`FFF0`, `FFE0`, `18F0`).
- **WiCAN Pro:** cuando llegue, comprobar su servicio BLE y añadirlo a `SERVICIOS_BLE` en `packages/obd-core/src/transport/ble-nativo.js` si no es uno de los anteriores.
- La app recuerda el adaptador elegido para no buscarlo cada vez.

## Servidor

- La app envía los avisos a `https://diag.talleresreyman.es/api/connect/avisos` (cambiable con `window.REYMAN_CONNECT_API`). Ver `docs/INTEGRACION.md`.
- Los orígenes de la app nativa ya están permitidos por defecto (`CONNECT_ORIGENES`).

## Pendiente

- Probar con adaptadores reales en Android e iPhone (vLinker MC+ y WiCAN Pro).
- Iconos y pantalla de inicio de la app; fichas para App Store y Google Play.
- Textos legales: política de privacidad de la app y texto final del consentimiento (versión `2026-11`).
- Avisos locales en el móvil (recordatorio de revisión e ITV) con `@capacitor/local-notifications`.
