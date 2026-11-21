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
| 1 | El enlace **no caduca nunca**. Quien lo tenga (reenvío, chat de WhatsApp de otra persona, móvil perdido) ve la ficha para siempre | Alta | **Servidor: pendiente de OK** |
| 2 | La app guardaba el enlace y la ficha **sin cifrar** (Preferences: también va a las copias de iCloud y de Android) | Alta | **Corregido en la app (0.5.0)** |
| 3 | Con el móvil desbloqueado o perdido, cualquiera abría la app y veía la ficha | Alta | **Corregido: Face ID, huella o código** |
| 4 | En el selector de apps se veía la ficha | Media | **Corregido: pantalla de privacidad** |
| 5 | No se aceptaban las condiciones, la privacidad ni el uso de la IA al empezar | Media (legal) | **Corregido: pantalla de condiciones con versión** |
| 6 | Si el taller desactivaba el enlace, la copia del móvil seguía viéndose | Media | **Corregido: la app la borra en cuanto el servidor dice que no vale** |
| 7 | Un enlace `reymanconnect://` podía cambiar la ficha sin avisar | Baja | **Corregido: aviso y Face ID para sustituirla** |
| 8 | El código viaja en la dirección (URL): queda en historiales y registros | Media | **Servidor: pendiente de OK** |
| 9 | No hay límite de peticiones por IP en los webhooks del área de clientes | Baja (el código no se puede adivinar) | **Servidor: pendiente de OK** |
| 10 | En el servidor de Diag siguen activas las rutas antiguas `/api/connect/talleres` y `/api/connect/avisos`, que ya no se usan | Baja | **Servidor: pendiente de OK** |

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

## Propuesta para el servidor (pendiente de OK de José: afecta a todos los clientes y a la web)

### 1. Enlaces con caducidad
- El enlace de WhatsApp sirve **30 días** para abrir la web o vincular la app.
- Después se pide uno nuevo por WhatsApp. Ya existe el flujo «enlace a petición», que comprueba que quien escribe es el titular.
- La web lo recuerda 60 días, como ahora.

### 2. Clave propia de cada móvil
- Al vincular la app, el servidor da una clave distinta del enlace, guardada en el llavero.
- Caduca a los 90 días sin uso y se puede revocar sola.
- Así, aunque el enlace se reenvíe, solo vale en el móvil donde se vinculó.

### 3. Clave fuera de la dirección
- La app manda la clave en una cabecera, no en la URL.

### 4. Revocar desde la App Reyman
- En la ficha del cliente, «Accesos»: lista de móviles vinculados con su fecha y el botón «Cerrar en todos».

### 5. Aviso al cliente por WhatsApp al vincular un móvil nuevo
- Dentro de la ventana de 24 h es gratis. Si no, plantilla de unos céntimos.

### 6. Límite de peticiones por IP
- En Cloudflare, delante de `n8n.talleresreyman.es/webhook/reyman-mitaller-*`.

### 7. Quitar las rutas antiguas `/api/connect/*` del servidor de Diag

Coste: sin IA. Solo el aviso del punto 5 si cae fuera de la ventana de WhatsApp.
