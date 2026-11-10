# Reyman Diag · reglas permanentes del proyecto

## Qué es
- **Reyman Diag** (https://diag.talleresreyman.es): app de diagnóstico OBD de Talleres Reyman.
- Enlazada con la **App Reyman**: mismos usuarios y mismo login (cookie de sesión de `.talleresreyman.es`, permisos `diag.*`). No guarda contraseñas ni PIN.
- **Multi-taller**: todo va por `tenant_id`. Nunca mezclar datos de talleres distintos.
- Repositorio con el núcleo OBD común (`packages/obd-core`), la app de taller (`apps/taller`), la app de cliente Reyman Connect (`apps/cliente`), el servidor (`server/`, Fastify + Postgres) y el despliegue (`deploy/`). Detalle en `README.md`; historial y pendientes en `docs/ESTADO.md`; App Reyman y n8n en `docs/INTEGRACION.md`.

## Interfaces
- Autel **MaxiVCI V200** y Autel **VCMI** (J2534, por el programa de enlace del portátil).
- Adaptadores **ELM327 / vLinker** (Bluetooth, puerto COM o Wi-Fi) y **WiCAN** (Wi-Fi).
- **Programa de enlace del portátil** (`deploy/pruebas-wifi/`): **no abre el navegador** y va en **ventana normal, nunca minimizada**. La app se abre a mano.

## Reglas de funcionamiento
- **Todo borrado de averías queda registrado**: quién, cuándo y vehículo (además de códigos, motivo, IP y dispositivo). Se registra antes de enviar el borrado al coche. Las tablas `diag_borrados`, `diag_auditoria` y `diag_ia_uso` son de solo añadir (triggers); no quitar esa protección.
- **Informes PDF al cliente**: salen desde **talleresreyman@gmail.com** (n8n «App Reyman · enviar correo»).
- **IA solo bajo botón y con tope de gasto** (`IA_TOPE_MES_EUR`). Nunca llamadas automáticas.
- **Nada con coste sin permiso**: antes de añadir algo que cueste dinero (IA, APIs, servicios), explicar el coste estimado y esperar su OK.
- **Mientras esté en pruebas**: grabar todas las sesiones de diagnóstico y generar solos el informe del taller y el del cliente (`GRABACION_AUTO` en `apps/taller/app.js`). No desactivarlo.

## Versiones de prueba (Drive)
- Carpeta de Drive **REYMAN DIAG**.
- Cada cambio va en una carpeta nueva **`Reyman_Diag_vX.Y.Z`** (versión de `package.json`), y la anterior se manda a la papelera.
- El paquete se genera con `node scripts/build-pruebas.js` (sale en `dist/`). Al cambiar la versión, actualizar también `deploy/pruebas-wifi/LEEME.txt` y `docs/ESTADO.md`.
- Las sesiones grabadas en el portátil van fuera de la carpeta de la versión (`REYMAN DIAG\Sesiones de diagnóstico\`) para no perderlas al cambiar de versión.

## Base de datos y servidor
- Migraciones en `server/migrations/NNN_nombre.sql`, se aplican solas al arrancar. Nunca editar una ya publicada: crear una nueva.
- `deploy/actualizar.sh` hace **copia de la base antes de actualizar** (`deploy/copia-base.sh` → `copias/diag_AAAAMMDD_HHMMSS.dump`, se guardan las 10 últimas). Si la copia falla, no actualiza. No quitar este paso.
- Restaurar: `bash deploy/restaurar-copia.sh` (lista) y `bash deploy/restaurar-copia.sh copias/<archivo>.dump`.
- **Si la tarea toca la base de datos o cambia algo que afecte a todos los usuarios**: explicar primero el plan en pocas líneas y esperar el OK.

## Forma de trabajar
- Pruebas: `npm test`. Tienen que pasar antes de subir nada.
- Cuando una tarea esté terminada y las pruebas pasen: **subir directamente a `main`, sin abrir PR**.
- Al terminar, decir **solo qué hay que actualizar y qué comprobar**.
- **Instrucciones siempre completas**: qué archivo, qué comando exacto y en qué orden. El usuario no tiene experiencia con terminal.
  - Actualizar el servidor: entrar al VPS y ejecutar `cd /opt/reyman-diag && bash deploy/actualizar.sh` (o botón «Actualizar» de la app, como administrador).
- **Comunicación en español, de tú, respuestas cortas.**
