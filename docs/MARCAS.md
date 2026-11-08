# Datos de marca (fase 3)

Objetivo acordado: **todas las marcas sin distinción**, empezando por las que más entran en el taller.

## Qué es público y qué no

- **Público y ya incluido:**
  - Todo el OBD estándar: averías P0/P2/U0, PIDs del modo 01, monitores y VIN.
  - La marca y el año se deducen del VIN de cualquier fabricante, con más de 150 códigos de fabricante en `vin.js`.
- **No público:**
  - Los identificadores UDS (servicio 22) de cada marca: nivel de hollín del DPF, temperatura del cambio, desgaste de pastillas, etc.
  - Los significados de los códigos P1xxx, B, C y U de fabricante.
  - Hay bases comunitarias, pero con errores y variantes por motor y año.

## Cómo se va a llenar la base (`web/lib/obd/marcas.js`)

1. **Marcas más frecuentes.** Se sacan de GemiCar con el CSV `vehiculos_clientes.csv` que ya exporta n8n: marcas por número de OT de los últimos 24 meses. Queda pendiente generar ese ranking cuando esté disponible el CSV.
2. **Candidatos por marca y motor.** Se recopilan de fuentes comunitarias, dejando constancia de la fuente.
3. **Verificación en un coche real del taller.** Para cada dato:
   - Se lee con Reyman Diag (modo de pruebas).
   - Se compara con lo que muestra el Autel AP200 en el mismo momento.
4. **Alta.** Solo se añaden las entradas que coinciden, con fecha, coche y quién lo comprobó (campo `verificado`). La app **solo usa entradas verificadas**.

Así la base crece con cada coche que pasa por el taller, sin datos inventados.

## Códigos de fabricante

- Los P1xxx y similares se muestran como «código específico del fabricante».
- Igual que los datos de marca, se irán añadiendo descripciones comprobadas, empezando por las marcas más frecuentes.
