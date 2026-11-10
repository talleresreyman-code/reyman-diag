# Reyman Diag · Reyman Connect

Un solo repositorio con el **núcleo OBD común** y dos apps encima:

- **Reyman Diag** (`apps/taller`): diagnosis para el taller. Es la app que ya existía.
- **Reyman Connect** (`apps/cliente`): app para particulares (iPhone y Android) con adaptador OBD Bluetooth. Ver `apps/cliente/LEEME.md`.

## Reyman Diag

Diagnosis OBD de Talleres Reyman. Es una app independiente, enlazada con la App Reyman: mismo acceso, mismos roles y cada lectura se guarda en la OT y la matrícula.

- **Dónde funciona:** móviles y tablet Android (Chrome), y portátil o PC con Windows (Chrome o Edge). Se instala como app (PWA).
- **Adaptador:** vLinker MC+ (ELM327). Por Bluetooth LE en Android y en el portátil, o por puerto COM (Bluetooth clásico emparejado con código 1234, o USB) en Windows.
- **Qué hace (fase 1):**
  - Bastidor (VIN), marca y año.
  - Averías confirmadas, pendientes y permanentes, con descripción en español.
  - Freeze frame.
  - Monitores con semáforo pre-ITV.
  - Datos en vivo con gráficas y grabación de pruebas de carretera.
  - Borrado de averías con registro.
  - Informe PDF interno y para el cliente, con envío por correo.
  - Diagnóstico con IA bajo botón y tope mensual de coste.
- **Qué no hace:** funciones de servicio de marca (reset de aceite, regeneración de DPF, codificaciones, ABS/airbag…). Para eso sigue el Autel AP200.

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/obd-core/` | **Núcleo común** (`@reyman/obd-core`): `obd/` motor ELM327, protocolos, PIDs, averías, VIN, monitores y gravedad para el conductor; `transport/` conexiones (Bluetooth web, Bluetooth nativo, puerto serie, Wi-Fi y simulador); `bateria.js`, `grabacion.js` y `mantenimiento.js`. |
| `apps/taller/` | Reyman Diag (HTML + JS sin compilar). Importa el núcleo con un *import map* (`@reyman/obd-core/` → `/core/`). |
| `apps/cliente/` | Reyman Connect (Capacitor). Se compila con `npm run build` dentro de esa carpeta. |
| `server/` | API en Node + Fastify con Postgres. `migrations/` tiene las tablas. Sirve la app de taller, el núcleo en `/core/` y las rutas de Reyman Connect (`/api/connect/…`). |
| `test/` | Pruebas del parser, simulador, API, conexiones, batería, grabación, Reyman Connect (`npm test`). |
| `deploy/` | Instalación y actualización en el VPS, y proxy. |
| `docs/` | Integración con App Reyman y n8n, y base de datos de marcas. |
| `scripts/` | Generador de la demo de Reyman Diag en un solo archivo HTML. |

## Desarrollo

```bash
npm install
npm test                 # 63 pruebas
node server/index.js     # sin DATABASE_URL: memoria + usuario de prueba (modo dev)
# abrir http://127.0.0.1:3020  ·  la cabecera x-diag-rol cambia el rol en las pruebas
```

Para probar sin coche, usa la opción **Simulador**: tres coches (diésel con EGR/DPF, gasolina con fallos de encendido e híbrido sin averías). El simulador también puede tener el motor parado, simular un arranque (caída de tensión) e inyectar un fallo intermitente (`_inyectarFallo`).

**Wi-Fi** (adaptadores ELM327 Wi-Fi y WiCAN Pro en modo Wi-Fi): solo desde el portátil, con el programa de enlace (`Reyman_Diag_WiFi`). La app se abre en `http://localhost:35001` y el botón Wi-Fi se activa solo ahí.

## Despliegue en el VPS

1. `git clone` en `/opt/reyman-diag`.
2. `deploy/instalar.sh` crea el `.env` con contraseñas aleatorias. Rellena las claves y ejecútalo otra vez.
3. DNS: registro `diag` → IP del VPS (Dinahosting). Proxy con `deploy/nginx-diag.conf` y certificado HTTPS. Web Bluetooth **exige HTTPS**.
4. Cambios en la App Reyman y en n8n: ver `docs/INTEGRACION.md`.
5. Para actualizar: `deploy/actualizar.sh` (antes hace copia de la base en `copias/`, guarda las 10 últimas). Restaurar: `deploy/restaurar-copia.sh`.

## Seguridad y registros

- No guarda contraseñas ni PIN: pregunta a la App Reyman quién es el usuario con su cookie de sesión.
- Permisos `diag.*`. Por defecto:
  - **Mecánico:** leer, borrar e IA.
  - **Oficina:** leer, enviar al cliente, IA y registro de borrados.
  - **Admin:** todo.
- Borrado de averías:
  - Primero se guarda la lectura y se registra quién, cuándo, qué códigos había, el motivo, la IP y el dispositivo.
  - Después se envía el borrado al coche.
  - El resultado se añade una sola vez. Un *trigger* impide modificar o borrar el registro.
- Las tablas `diag_auditoria` y `diag_ia_uso` son de solo añadir.
