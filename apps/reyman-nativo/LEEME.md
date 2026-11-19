# App Reyman · app instalable (iPhone, iPad y Android)

Es la misma App Reyman de https://app.talleresreyman.es, pero instalada como app «Reyman» (`es.talleresreyman.app`). Funciona igual que Reyman Diag (`apps/taller-nativo`):

- **Abre la web por dentro.** Se actualiza sola al actualizar el servidor de la App Reyman: no hay que compilar la app por cada cambio de la web.
- **Enlazada con Reyman Diag** (son dos apps):
  - en una OT, «🩺 Abrir Reyman Diag con este coche» abre la app Reyman Diag con `reymandiag://abrir?ot=…&mat=…&vin=…` (si Diag no está instalada, abre la web de Diag);
  - en Reyman Diag, «← App Reyman» vuelve con `reyman://`.
- **Login**: cada app guarda su sesión. La primera vez se entra con el PIN en cada una.
- **Permisos**: cámara, fotos y micrófono, para las fotos y vídeos de las OT y de la recepción.
- **Notificaciones** (v1.1.0, 20/11/2026): en iPhone/iPad, notificaciones nativas (APNs) con `@capacitor/push-notifications`. `preparar-nativo.mjs` añade `App.entitlements` (aps-environment production), `CODE_SIGN_ENTITLEMENTS` y los dos métodos del `AppDelegate`; `registrar-bundle.mjs` activa «Push Notifications» en el identificador. La App Reyman pide el permiso, guarda el token y las envía con la clave APNs (.p8) que se sube en Ajustes. Android: pendiente (necesita un proyecto de Firebase).

## Cuándo hay que compilar la app
Solo si cambia esta carpeta: permisos, plugins, icono o dirección del servidor.

| Plataforma | Cómo se compila | Dónde queda |
|---|---|---|
| iPhone / iPad | `.github/workflows/app-reyman-ios.yml` | TestFlight (app «Reyman», es.talleresreyman.app) |
| Android | `.github/workflows/app-reyman-android.yml` | APK en la rama `apk-app` |

Usa los mismos secretos de App Store Connect que Reyman Diag (ya están en este repositorio).

## Primera vez (una sola vez)
En App Store Connect: Apps → + → Nueva app → plataforma iOS, ID de paquete `es.talleresreyman.app` (lo da de alta solo la primera compilación), nombre «App Reyman Taller» (el nombre en la tienda tiene que ser único; en el móvil saldrá «Reyman»), SKU `app-reyman`. Después, volver a lanzar el workflow «App Reyman · iOS».

## Icono
`assets/icono-1024.png` (iOS) y `assets/android/` (Android). Los copia `scripts/preparar-nativo.mjs`.
