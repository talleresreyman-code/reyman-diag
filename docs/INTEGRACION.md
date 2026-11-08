# Integración con App Reyman y n8n

Reyman Diag no tiene acceso propio a GemiCar ni a OneDrive: todo pasa por la App Reyman y por n8n, igual que el resto del ecosistema. Este documento recoge lo que hay que añadir fuera de este repositorio.

> No he tenido acceso al código de la App Reyman. Los nombres de rutas y campos siguen su `ARQUITECTURA.md`. Antes de desplegar, conviene revisar los tres puntos de la App Reyman (1, 2 y 3). Las rutas se pueden cambiar con variables del `.env` sin tocar código.

## 1. Sesión compartida (App Reyman)

La App Reyman guarda la sesión en una cookie httpOnly. Para que el navegador la envíe también a `diag.talleresreyman.es`:

- Emitir la cookie con `Domain=.talleresreyman.es`, sin cambiar `HttpOnly`, `Secure` ni `SameSite=Lax`.
- Ruta `GET /api/yo` (variable `APP_REYMAN_YO`). Con la cookie, debe devolver:

```json
{ "usuario": { "id": 7, "nombre": "Bryhan", "rol": "mecanico", "permisos": ["taller.*", "diag.*"] },
  "taller": { "id": "reyman", "nombre": "Talleres Reyman" } }
```

- Si no hay sesión, debe devolver 401. Reyman Diag manda entonces al usuario a la App Reyman con `?volver=<url>`. Hace falta que la App Reyman, tras entrar, redirija a `volver` cuando sea un subdominio de `talleresreyman.es`.
- **Permisos.** Añadir al catálogo `server/permisos.js` de la App Reyman los permisos de `server/auth.js` (`diag.ver`, `diag.leer`, `diag.borrar`, `diag.enviar_cliente`, `diag.ia`, `diag.historial`). Así se podrán ajustar desde Ajustes → Roles y permisos. Mientras no estén, se aplican los de por defecto según el rol.
- **Acceso desde el menú.** Opcional: un módulo de enlace en la App Reyman que abra `https://diag.talleresreyman.es`.

## 2. Buscar OT por bastidor o matrícula (App Reyman)

Ruta nueva en la App Reyman, por ejemplo en `server/modules/diag/routes.js`. Se protege con la clave de API del taller (`x-api-key`).

```
GET /api/diag/ots?vin=WVWZZZ...&matricula=4521KLM&taller=reyman
→ { "coincidencias": [ {ot, matricula, vin, cliente, vehiculo, situacion, email, telefono} ],
    "abiertas":      [ ...todas las OT abiertas, mismos campos... ] }
```

- Las OT abiertas ya están en el dataset `ots_abiertas` que manda n8n.
- **Falta el bastidor.** Hay que comprobar si `ots_abiertas` trae la columna. Si no, se añade en la consulta de n8n a GemiCar (tabla de vehículos, campo bastidor) o se cruza con `vehiculos_clientes.csv`.
- Sin bastidor, la app sigue funcionando: el mecánico elige la OT de la lista o escribe la matrícula.

## 3. Correo (n8n «App Reyman · enviar correo»)

Reyman Diag llama al mismo webhook (`N8N_CORREO_URL`, cabecera `x-reyman-app`) con este cuerpo:

```json
{ "tipo": "correo", "origen": "reyman-diag", "para": "cliente@…", "cc": "talleresreyman@gmail.com",
  "asunto": "Informe de diagnosis 4521KLM", "html": "<p>…</p>",
  "adjuntos": [ { "nombre": "Diagnosis_4521KLM.pdf", "tipo": "application/pdf", "base64": "…" } ] }
```

Hay que comprobar que el flujo acepta `adjuntos` en base64; si no, se añade un nodo que los convierta a binario antes del nodo de Gmail. Debe responder `{ "ok": true }`.

## 4. Sesiones de datos en vivo a OneDrive (flujo nuevo en n8n)

Flujo «Reyman Diag · sesiones a OneDrive». Cada noche a las 4:27 (escalonado respecto al resto de flujos del VPS):

1. `GET https://diag.talleresreyman.es/api/ingest/sesiones` con la cabecera `x-api-key: DIAG_INGEST_KEY`.
2. Por cada sesión, subir `csv` a `01_TALLERES REYMAN/DIAGNOSIS OBD/<año>/<OT> <matrícula>/sesion_<fecha>.csv`.
3. `POST /api/ingest/sesiones/<id>/subida` con `{ "destino": "<ruta>" }`. La app borra entonces las muestras del VPS y guarda la ruta.

## 5. Copia de seguridad

Añadir la base `diag` al flujo «App Reyman · copia diaria a OneDrive». La alternativa es un `pg_dump` en cron: `docker compose exec -T db pg_dump -U diag -Fc diag > copia.dump`.

## 6. IA

- `ANTHROPIC_API_KEY`: la misma cuenta que ya usa el taller, u otra clave para separar el gasto.
- Tope mensual: `IA_TOPE_MES_EUR` (15 € por defecto). Cada análisis cuesta del orden de céntimos.
- Los precios por millón de tokens van en el `.env`. Hay que comprobar los vigentes del modelo elegido antes de activarlo.

## Reyman Connect (app de cliente) · v0.3

Rutas nuevas en el servidor de Reyman Diag:

| Ruta | Sesión | Para qué |
|---|---|---|
| `GET /api/connect/talleres/:codigo` | No | Ficha pública del taller (nombre, teléfono, WhatsApp, dirección, horario) para vincularlo en la app. |
| `POST /api/connect/avisos` | No | La app envía el estado del coche o una petición de cita. Exige consentimiento (`consentimiento.aceptado` + versión), limpia los datos y limita a 10 avisos cada 10 min por IP. |
| `GET /api/connect/avisos/lista?pendientes=1` | Sí | La oficina ve los avisos de su taller. |
| `POST /api/connect/avisos/:id/atendido` | Sí | Marca un aviso como atendido (una sola vez). |

- Tabla nueva `connect_avisos` (migración `002_connect.sql`, se aplica sola al arrancar).
- Talleres con código: `server/connect-talleres.js` (de momento solo `REYMAN` → tenant `reyman`). Cuando haya más talleres pasará a la base de datos de la App Reyman.
- CORS solo para los orígenes de la app nativa (`CONNECT_ORIGENES`).
- **n8n (pendiente):** si se define `N8N_CONNECT_URL`, cada aviso nuevo se envía a ese webhook (cabecera `x-reyman-clave` = `N8N_CLAVE`) para mandarlo al Telegram del taller. Hay que crear el flujo.
- **App Reyman (pendiente):** pestaña "Avisos de clientes" en la App Reyman que lea `/api/connect/avisos/lista`.
