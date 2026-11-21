# Revisiones · app instalable (iPhone, iPad y Android)

Es la app de inspección visual de vehículos (Trend Cars y flotas) de https://app.talleresreyman.es/revisiones/, instalada como app «Revisiones» (`es.talleresreyman.revisiones`). Funciona igual que la App Reyman (`apps/reyman-nativo`) y Reyman Diag (`apps/taller-nativo`):

- **Abre la web por dentro.** Se actualiza sola al actualizar el servidor de la App Reyman: no hay que compilar la app por cada cambio de Revisiones.
- **Enlazada con la App Reyman** (son dos apps):
  - en Revisiones, el botón de la App Reyman (arriba a la derecha) abre la app «Reyman» con `reyman://`; si no está instalada, abre la web;
  - en la App Reyman, pestaña Revisiones, «Abrir la app de revisiones» abre esta app con `reymanrev://`; si no está instalada, abre la web dentro de la App Reyman.
- **Login**: mismo usuario y PIN que la App Reyman. La primera vez se entra con el PIN en esta app.
- **Permisos**: cámara y fotos, para las fotos de las inspecciones.
- **Notificaciones**: no tiene. Los avisos de inspecciones (listas para enviar, plazo de 48 h) llegan a la App Reyman.

## Cuándo hay que compilar la app
Solo si cambia esta carpeta: permisos, icono o dirección del servidor.

| Plataforma | Cómo se compila | Dónde queda |
|---|---|---|
| iPhone / iPad | `.github/workflows/revisiones-ios.yml` | TestFlight (app «Revisiones», es.talleresreyman.revisiones) |
| Android | `.github/workflows/revisiones-android.yml` | APK en la rama `apk-revisiones` |

Usa los mismos secretos de App Store Connect que Reyman Diag y la App Reyman (ya están en este repositorio).

## Primera vez (una sola vez)
En App Store Connect: Apps → + → Nueva app → plataforma iOS, ID de paquete `es.talleresreyman.revisiones` (lo da de alta solo la primera compilación), nombre «Revisiones Reyman» (el nombre en la tienda tiene que ser único; en el móvil saldrá «Revisiones»), SKU `revisiones-reyman`. Después, volver a lanzar el workflow «Revisiones · iOS».

## Icono
`assets/icono-1024.png` (iOS) y `assets/android/` (Android), hechos con el icono de la web (`web/revisiones/icono.svg` de reyman-app). Los copia `scripts/preparar-nativo.mjs`.
