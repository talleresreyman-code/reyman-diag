# Ford Kuga 2023 híbrido (WF0FXXWPMHPE00628) · lo que hace la Autel (grabado 08/11/2026)

Grabación pasiva con VCMI en cable en Y, pines 6/14, 500 kbaud 11 bits, mientras la MS919 + V200 diagnosticaba.

## Identificación (modo Ford)
- `22 D100` a cada centralita: «sesión activa» (respuesta `62 D1 00 01`). Es la sonda que usa Autel para saber si existe.
- `22 F188`: software (estrategia). Motor `NX6A-14C204-EK`, BECM `LX68-14C197-FA`.
- `22 F113`: referencia de pieza. Motor `LX6A-12A650-DGA`, BECM `LX68-10B687-VA`.
- `22 F190` y `22 F124`: no los da el BECM (7F 22 31).
- Averías: `19 02 8F`.

## Centralitas en los pines 6/14
Autel prueba 7C7 7D0 703 726 6F0 723 764 746 744 783 7B2 765 750 7E0 775 751 7E6 7E2 7C4 7C6 791 725 760.
Contestan las mismas 9 que encuentra Reyman Diag. **ABS (760), airbag, cuadro... no contestan en 6/14**: estarán en otros pines (siguiente grabación: pines 3 y 11).

## BECM (7E4 → 7EC): datos en vivo que lee Autel (bucle de 13 DID)
DD02, 4802, 483E, 483F, 4840, 4841, 485D, F45B, D04F, 0582, 0118, 480B, 4808

Coherentes entre sí (comprobados en este coche):
| DID | Dato | Fórmula | Valor |
|---|---|---|---|
| DD01 | Cuentakilómetros | A·65536+B·256+C (km) | 47.252 km (OBD A6: 47.248,7) |
| 4801 | Carga batería alta tensión (SOC) | (A·256+B)·0,002 % | 55,8 % (F45B = 55,7 %) |
| 480D | Tensión batería alta tensión | (A·256+B)·0,01 V | 223,5 V |
| 4840 / 4841 | Tensión de celda (dos celdas extremas) | A·256+B mV | 3.727 / 3.731 mV (×60 ≈ 223,6 V) |
| F4xx | Mismos PID que el modo 01 (F405 = 0105, F431 = 0131, F442 = 0142...) | como OBD | |

Sin confirmar: 4800 (posible temperatura), 4802, 483E, 483F, 485D, 480B, 4808, 0582, 0118, D04F.

## Modo OBD de Autel
Pide lo mismo que Reyman Diag: PID del modo 01 (incluidos 5B, 9A, 9D, 9E), 09 02 y modo 06 (MID 01, 02, 21, 31, 35, A1–A5).
