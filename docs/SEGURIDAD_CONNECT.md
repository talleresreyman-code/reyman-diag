# Reyman Connect · análisis de seguridad (21/11/2026)

## Cómo funciona hoy el acceso del cliente
- El enlace personal de «Mi taller» (`talleresreyman.com/mi-taller/?t=<código>`) llega por WhatsApp.
- El código es de 24 a 64 letras y números al azar, así que no se puede adivinar.
- Lo comprueba el flujo n8n «Área clientes · Mi taller» contra la tabla «Área clientes · Accesos».
- Solo se corta a mano (`activo = false`).
- Con ese código se ven los coches, el estado, la ITV, los presupuestos y las facturas desde 2024, y se descargan los PDF.

## Puntos débiles encontrados

| # | Riesgo | Gravedad | Estado |
|---|---|---|---|
| 1 | El enlace **no caduca nunca**. Quien lo tenga (reenvío, chat de WhatsApp de otra persona, móvil perdido) ve la ficha para siempre | Alta | **Corregido: caduca a los 30 días** |
| 2 | La app guardaba el enlace y la ficha **sin cifrar** (Preferences: también va a las copias de iCloud y de Android) | Alta | **Corregido en la app (0.5.0)** |
| 3 | Con el móvil desbloqueado o perdido, cualquiera abría la app y veía la ficha | Alta | **Corregido: Face ID, huella o código** |
| 4 | En el selector de apps se veía la ficha | Media | **Corregido: pantalla de privacidad** |
| 5 | No se aceptaban las condiciones, la privacidad ni el uso de la IA al empezar | Media (legal) | **Corregido: pantalla de condiciones con versión** |
| 6 | Si el taller desactivaba el enlace, la copia del móvil seguía viéndose | Media | **Corregido: la app la borra en cuanto el servidor dice que no vale** |
| 7 | Un enlace `reymanconnect://` podía cambiar la ficha sin avisar | Baja | **Corregido: aviso y Face ID para sustituirla** |
| 8 | El código viaja en la dirección (URL): queda en historiales y registros | Media | **Corregido: la app usa su clave en cabecera** |
| 9 | No hay límite de peticiones por IP en los webhooks del área de clientes | Baja (el código no se puede adivinar) | **Pendiente: regla en Cloudflare (a mano)** |
| 10 | En el servidor de Diag siguen activas las rutas antiguas `/api/connect/talleres` y `/api/connect/avisos`, que ya no se usan | Baja | **Corregido: quitadas (0.7.0)** |

## Hecho en la app (0.5.0)

### Condiciones la primera vez
- Pantalla con la política de privacidad, el uso de la IA y cómo funciona la app.
- Hay que marcar dos casillas para seguir.
- Se guarda la versión y la fecha (`VERSION_CONDICIONES` en `seguridad.js`). Si cambian, se vuelven a pedir.
- Los textos los tiene que revisar Antonio Quesada (protección de datos).

### Bloqueo
- Con ficha guardada, la app se abre bloqueada.
- Se desbloquea con Face ID, Touch ID o huella. Si falla, con el código o el patrón del móvil (plugin `@capgo/capacitor-native-biometric`).
- Vuelve a bloquearse si ha estado más de 1 minuto en segundo plano.
- La ficha solo se guarda si el móvil tiene algún bloqueo y el cliente lo confirma con Face ID al añadirla.
- Si después quita el código del móvil, la ficha se borra.

### Cifrado
- El enlace, la ficha, el nombre, el móvil y las solicitudes van al llavero del sistema: Keychain «solo este dispositivo» en iOS y Keystore en Android (`@aparajita/capacitor-secure-storage`).
- No van a iCloud ni a las copias de seguridad.
- Al actualizar, lo que había guardado sin cifrar se mueve al llavero y se borra de donde estaba.

### Pantalla de privacidad
- El contenido se ve borroso en el selector de apps (`@capacitor/privacy-screen`).

### Caducidad en el móvil
- Si la ficha no se abre en **90 días**, se borra del móvil.

### Borrado a distancia
- Si el taller desactiva el enlace (por ejemplo, porque el cliente ha perdido el móvil), la app borra la ficha la próxima vez que se abra con internet.

### Quitar la ficha
- Siempre disponible, también desde la pantalla de bloqueo.
- Borra todo lo privado del llavero.

## Hecho en el servidor (21/11/2026, con OK de José) · app 0.7.0

### 1. Enlaces con caducidad
- El enlace de WhatsApp sirve **30 días** desde que se envió (los anteriores, desde el 21/11/2026).
- Después se pide uno nuevo por WhatsApp. El flujo «Área clientes · enlace a petición» crea ahora un código nuevo en cada envío y dice «vale 30 días».

### 2. Clave propia de cada móvil
- Flujo n8n «Reyman Connect · vincular móvil»: `POST /webhook/reyman-connect-vincular` con `{ t, dispositivo }` → `{ ok, clave }`.
- Tabla «Área clientes · Dispositivos»: clave, cliente, móvil, fechas, activo y quién la revocó.
- Caduca a los **90 días sin uso**. Máximo 5 vinculaciones al día por cliente.
- Las instalaciones anteriores cambian su enlace por la clave solas la primera vez que se abren.

### 3. Clave fuera de la dirección
- La app manda la clave en la cabecera `x-reyman-clave`. Solo los PDF la llevan en la dirección (`?k=`), porque los abre el navegador del sistema.

### 4. Revocar desde la App Reyman
- Flujo n8n «App Reyman · móviles de Reyman Connect del cliente»: `POST /webhook/reyman-app-connect-moviles` (cabecera `x-reyman-app`).
- `{ accion: 'listar' | 'revocar' | 'revocar_todos', cod_cliente, id?, quien }`. Nunca devuelve las claves.
- **Pendiente:** la pantalla «Accesos» en la ficha del cliente de la App Reyman (repositorio reyman-app).

### 5. Aviso al cliente por WhatsApp al vincular un móvil
- Y aviso al taller por Telegram. Dentro de la ventana de 24 h es gratis; fuera, plantilla de unos céntimos.

### 6. Límite de peticiones por IP (pendiente, a mano)
- En Cloudflare → talleresreyman.es → Seguridad → WAF → Reglas de limitación de velocidad.
- Regla: ruta que empieza por `/webhook/reyman-mitaller` o `/webhook/reyman-connect`, 30 peticiones por minuto por IP, bloquear 10 minutos. Entra en el plan gratuito (una regla).

### 7. Rutas antiguas `/api/connect/*` del servidor de Diag
- Quitadas las públicas de ficha del taller y envío de avisos. Siguen las del diagnóstico remoto (`/api/connect/remoto/*`) y la consulta de los avisos antiguos para la oficina, con sesión.

Coste: sin IA. Solo el aviso del punto 5 si cae fuera de la ventana de WhatsApp.
