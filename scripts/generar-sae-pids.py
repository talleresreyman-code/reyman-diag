#!/usr/bin/env python3
"""Reyman Diag · genera packages/obd-core/src/obd/sae-pids.js a partir de la base abierta OBDb (SAE J1979).

Origen: data/obdb/SAEJ1979-default.json (proyecto OBDb «SAEJ1979», licencia CC BY-SA 4.0, ver data/obdb/LICENSE).
El archivo generado es una obra derivada de esa base: lleva la misma licencia y la atribución en su cabecera.
Aquí solo se traduce al español y se cambia el formato; las posiciones, escalas y límites son los de OBDb.

Uso: python3 scripts/generar-sae-pids.py
"""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'data/obdb/SAEJ1979-default.json'
VERSION = (RAIZ / 'data/obdb/VERSION').read_text().split()[0][:10]
DESTINO = RAIZ / 'packages/obd-core/src/obd/sae-pids.js'

# ---------------------------------------------------------------- traducción
# Frases completas (se aplican primero, sin distinguir mayúsculas)
FRASES = [
    ('Malfunction indicator lamp', 'Testigo de avería (MIL)'),
    ('Number of DTCs stored in this ECU', 'Averías guardadas en esta centralita'),
    ('DTC that caused required freeze frame data storage', 'Avería que guardó el freeze frame'),
    ('Compression ignition monitoring supported', 'Motor diésel (monitores de encendido por compresión)'),
    ('Calculated engine load', 'Carga calculada del motor'),
    ('Absolute load value', 'Carga absoluta'),
    ('Engine RPM', 'Régimen del motor'),
    ('Vehicle speed', 'Velocidad'),
    ('Timing advance', 'Avance del encendido'),
    ('Air flow rate from mass air flow sensor', 'Caudal de aire (caudalímetro)'),
    ('Commanded secondary air status', 'Aire secundario ordenado'),
    ('OBD requirements to which vehicle is designed', 'Norma OBD del vehículo'),
    ('Emission requirements to which vehicle is designed', 'Norma de emisiones del vehículo'),
    ('Power take off (PTO) status', 'Toma de fuerza (PTO)'),
    ('Power Take Off (PTO) Output Status', 'Salida de toma de fuerza (PTO)'),
    ('Time since engine start', 'Tiempo desde el arranque'),
    ('Distance traveled while MIL was activated', 'Distancia con el testigo encendido'),
    ('Time run by the engine while MIL was activated', 'Tiempo de motor con el testigo encendido'),
    ('Number of warm-ups since diagnostic trouble codes cleared', 'Calentamientos desde el borrado de averías'),
    ('Distance traveled since diagnostic trouble codes cleared', 'Distancia desde el borrado de averías'),
    ('Engine run time since diagnostic trouble codes cleared', 'Tiempo de motor desde el borrado de averías'),
    ('Fuel pressure relative to manifold vacuum', 'Presión de combustible (relativa al colector)'),
    ('Type of fuel currently being used by the vehicle', 'Combustible en uso'),
    ('Alcohol fuel percentage', 'Porcentaje de alcohol en el combustible'),
    ('Commanded equivalence ratio', 'Lambda ordenada'),
    ('Commanded throttle actuator control', 'Mariposa ordenada'),
    ('Commanded evaporative purge', 'Purga del cánister ordenada'),
    ('Fuel tank level', 'Nivel de combustible'),
    ('Barometric pressure', 'Presión atmosférica'),
    ('Control module voltage', 'Tensión de la centralita'),
    ('Ambient air temperature', 'Temperatura exterior'),
    ('Hybrid battery pack remaining charge', 'Carga de la batería híbrida'),
    ('Engine oil temperature', 'Temperatura del aceite'),
    ('Fuel injection timing', 'Avance de la inyección'),
    ('Engine fuel rate (alternate)', 'Consumo de combustible del motor (alternativo)'),
    ('Engine fuel rate', 'Consumo de combustible del motor'),
    ('Vehicle fuel rate', 'Consumo de combustible del vehículo'),
    ("Driver's demand engine torque", 'Par pedido por el conductor'),
    ('Actual engine torque', 'Par real del motor'),
    ('Engine reference torque', 'Par de referencia del motor'),
    ('Engine Friction - Percent Torque', 'Par de fricción del motor'),
    ('Recommended gear', 'Marcha recomendada'),
    ('Glow plug lamp status', 'Testigo de calentadores'),
    ('Manual Trans Neutral Gear Status', 'Cambio manual en punto muerto'),
    ('Auto Trans Neutral Drive Status', 'Cambio automático en N/D'),
    ('Manifold surface temperature', 'Temperatura superficial del colector'),
    ('Engine coolant temperature', 'Temperatura del refrigerante'),
    ('Intake manifold absolute pressure', 'Presión absoluta del colector de admisión'),
    ('Intake air temperature', 'Temperatura del aire de admisión'),
    ('Accelerator pedal position (relative)', 'Pedal del acelerador (relativo)'),
    ('Relative throttle position', 'Posición relativa de la mariposa'),
    ('Absolute throttle position', 'Posición de la mariposa'),
    ('Fuel rail pressure (absolute)', 'Presión del rail (absoluta)'),
    ('Fuel rail pressure', 'Presión del rail'),
    ('Fuel pressure', 'Presión de combustible'),
    ('Total Engine Run Time', 'Tiempo total de motor'),
    ('Total Idle Run Time', 'Tiempo total al ralentí'),
    ('Total Run Time With PTO Active', 'Tiempo total con toma de fuerza'),
    ('Odometer', 'Cuentakilómetros'),
    ('Engine odometer', 'Kilómetros del motor'),
    ('Transmission actual gear ratio', 'Relación de la marcha engranada'),
    ('Transmission actual gear', 'Marcha engranada'),
    ('Maximum current vehicle speed limit', 'Límite de velocidad actual'),
    ('Cylinder fuel rate', 'Combustible por cilindro'),
    ('Evap system sealed', 'Sistema EVAP cerrado'),
    ('Engine exhaust flow rate', 'Caudal de gases de escape'),
    ('Traction battery pack State of Health', 'Salud de la batería de tracción'),
    ('Distance since module reflash or replacement', 'Distancia desde la reprogramación o cambio de la centralita'),
    ('Distance since state of health update', 'Distancia desde la última actualización de la salud'),
    ('Propulsion system active trips since DTCs cleared', 'Ciclos de uso desde el borrado de averías'),
    ('Battery capacity calculation', 'Cálculo de capacidad de la batería'),
    ('Emission system readiness', 'Monitores de emisiones'),
    ('Vehicle malfunction indicator status', 'Estado del testigo de avería (vehículo)'),
    ('ECU malfunction indicator status', 'Estado del testigo de avería (centralita)'),
    ('MI display strategy', 'Estrategia del testigo de avería'),
    ('Highest ECU class B1 malfunction counter', 'Contador de averías clase B1'),
    ('Commanded fresh air flow', 'Caudal de aire fresco ordenado'),
    ('Hydrocarbon doser flow rate', 'Caudal del dosificador de gasoil (DPF)'),
    ('Hydrocarbon doser injector duty cycle', 'Ciclo del inyector dosificador de gasoil (DPF)'),
    ('Aftertreatment fuel pressure', 'Presión de combustible del postratamiento'),
    ('Engine-out NOx mass emission rate', 'NOx a la salida del motor'),
    ('Tailpipe NOx mass emission rate', 'NOx en el escape'),
    ('Normalized trigger for particulate filter regen', 'Indicador de necesidad de regeneración del DPF'),
    ('Average time between particulate filter regens', 'Tiempo medio entre regeneraciones del DPF'),
    ('Average distance between particulate filter regens', 'Distancia media entre regeneraciones del DPF'),
    ('Particulate filter regen type', 'Tipo de regeneración del DPF'),
    ('Particulate filter regen in progress', 'Regeneración del DPF en curso'),
    ('NOx adsorber desulfurization in progress', 'Desulfuración del catalizador NOx en curso'),
    ('NOx adsorber regen in progress', 'Regeneración del catalizador NOx en curso'),
    ('Average reagent consumption', 'Consumo medio de AdBlue'),
    ('Average demanded reagent consumption', 'Consumo medio de AdBlue pedido'),
    ('Reagent tank level', 'Nivel del depósito de AdBlue'),
    ('Run time with NOx warning active', 'Tiempo con el aviso de NOx activo'),
    ('NOx warning system active', 'Aviso de NOx activo'),
    ('Particulate warning system active', 'Aviso de partículas activo'),
    ('SCR inducement system active', 'Limitación por el sistema SCR activa'),
    ('Distance travelled in the current 10,000 km block', 'Distancia en el bloque actual de 10.000 km'),
    ('Exhaust particulate control diagnostic time', 'Tiempo de diagnóstico del control de partículas'),
    ('Exhaust particulate control diagnostic count', 'Contador de diagnóstico del control de partículas'),
    ('Fuel cell system voltage', 'Tensión de la pila de combustible'),
    ('Fuel cell fuel consumption', 'Consumo de la pila de combustible'),
    ('Fuel cell current over the last second', 'Corriente de la pila de combustible (último segundo)'),
    ('Fuel cell power over the last second', 'Potencia de la pila de combustible (último segundo)'),
    ('State of certified range supported', 'Autonomía certificada disponible'),
    ('State of certified energy supported', 'Energía certificada disponible'),
    ('State of certified energy', 'Energía certificada'),
    ('State of certified range', 'Autonomía certificada'),
    ('Particulate control (PCD) warning lamp', 'Testigo de control de partículas (PCD)'),
    ('NOx control (NCD) warning lamp', 'Testigo de control de NOx (NCD)'),
    ('Shared NCD and PCD warning lamp', 'Testigo común NCD y PCD'),
    ('NTE deficiency for PM active area', 'Deficiencia NTE de partículas'),
    ('Inside manufacturer-specific PM NTE carve-out area', 'Dentro de la zona excluida NTE del fabricante (partículas)'),
    ('Outside PM control area', 'Fuera de la zona de control de partículas'),
    ('Inside PM control area', 'Dentro de la zona de control de partículas'),
    ('Enhanced Hybrid/EV Vehicle Charging State', 'Modo de carga híbrido/eléctrico (ampliado)'),
    ('Hybrid/EV Vehicle Charging State', 'Modo de carga híbrido/eléctrico'),
    ('Hybrid/EV Battery System Voltage', 'Tensión de la batería híbrida/eléctrica'),
    ('Hybrid/EV Battery System Current', 'Corriente de la batería híbrida/eléctrica'),
    ('DEF concentration', 'Concentración de AdBlue'),
    ('DEF tank temperature', 'Temperatura del depósito de AdBlue'),
    ('DEF tank level', 'Nivel del depósito de AdBlue'),
    ('DEF type', 'Calidad del AdBlue'),
    ('Commanded DEF dosing', 'Dosificación de AdBlue ordenada'),
    ('DEF used in the current driving cycle', 'AdBlue gastado en este ciclo'),
]

# Trozos (se aplican después, de más largo a más corto)
TROZOS = [
    (r'\bmonitoring completed\b', 'completado'),
    (r'\bmonitoring enabled\b', 'activo en este ciclo'),
    (r'\bmonitoring supported\b', 'disponible'),
    (r'\bmonitoring ready\b', 'listo'),
    (r'\bmonitoring\b', ''),
    (r'^Comprehensive component\b', 'Monitor de componentes generales'),
    (r'^Fuel system\b(?= (?:completado|activo|disponible|listo))', 'Monitor del sistema de combustible'),
    (r'^Misfire\b', 'Monitor de fallos de encendido'),
    (r'^EGR system\b', 'Monitor EGR / VVT'),
    (r'^Oxygen sensor heater\b', 'Monitor de calefacción de sondas lambda'),
    (r'^Oxygen sensor\b(?= (?:completado|activo|disponible|listo|$))', 'Monitor de sondas lambda'),
    (r'^A/C system refrigerant\b', 'Monitor de refrigerante de A/A'),
    (r'^Secondary air system\b', 'Monitor de aire secundario'),
    (r'^Evaporative system\b', 'Monitor EVAP'),
    (r'^Heated catalyst\b', 'Monitor de catalizador calefactado'),
    (r'^Catalyst\b(?= (?:completado|activo|disponible|listo|$))', 'Monitor del catalizador'),
    (r'^Fuel system (\d) status', r'Estado del sistema de combustible \1'),
    (r'\bShort term secondary O2 sensor fuel trim\b', 'Corrección de mezcla corta (sonda posterior)'),
    (r'\bLong term secondary O2 sensor fuel trim\b', 'Corrección de mezcla larga (sonda posterior)'),
    (r'\bShort term fuel trim\b', 'Corrección de mezcla a corto plazo'),
    (r'\bLong term fuel trim\b', 'Corrección de mezcla a largo plazo'),
    (r'\bcompression ignition\b', 'diésel'),
    (r'^0?2S Bank (\d), Sensor (\d) present', r'Sonda lambda B\1S\2 instalada'),
    (r'^O2S Output Voltage Bank (\d), Sensor (\d)', r'Tensión sonda lambda B\1S\2'),
    (r'^SHRTFT associated with O2S(\d)(\d)', r'Corrección corta asociada a la sonda B\1S\2'),
    (r'^Lambda value, Equivalence Ratio Bank (\d), Sensor (\d)', r'Lambda sonda B\1S\2'),
    (r'^Wide Range O2S Voltage, O2 Sensor Bank (\d), Sensor (\d)', r'Tensión sonda de banda ancha B\1S\2'),
    (r'^Wide Range O2S Current, O2 Sensor Bank (\d), Sensor (\d)', r'Corriente sonda de banda ancha B\1S\2'),
    (r'^O2 concentration\b', 'Concentración de O2'),
    (r'^O2 sensor lambda\b', 'Lambda sonda'),
    (r'^Catalyst temperature\b', 'Temperatura del catalizador'),
    (r'\bEvap system vapor pressure\b', 'Presión de vapor EVAP'),
    (r'^Absolute evap\b', 'EVAP absoluta:'),
    (r'\bEvap system purge pressure\b', 'Presión de purga EVAP'),
    (r'\bAccelerator pedal position\b', 'Pedal del acelerador'),
    (r'\bAbsolute Throttle Position\b', 'Posición de la mariposa'),
    (r'\bCommanded EGR\b', 'EGR ordenada'),
    (r'\bActual EGR\b', 'EGR real'),
    (r'\bEGR error\b', 'Error de la EGR'),
    (r'\bEGR (\w) error\b', r'Error de la EGR \1'),
    (r'\bEGR mass flow rate\b', 'Caudal másico de la EGR'),
    (r'\bduty cycle/position\b', 'ciclo/posición'),
    (r'^Exhaust Gas Recirculation Temp Sensor (\w)', r'Temperatura EGR \1'),
    (r'\bCommanded intake air flow (\w) control\b', r'Caudal de admisión \1 ordenado'),
    (r'\bRelative intake air flow (\w) position\b', r'Posición relativa del caudal de admisión \1'),
    (r'\bCommanded Throttle Actuator (\w) Control\b', r'Mariposa \1 ordenada'),
    (r'\bRelative Throttle (\w) Position\b', r'Posición relativa de la mariposa \1'),
    (r'\bCommanded Fuel Rail Pressure\b', 'Presión del rail ordenada'),
    (r'\bFuel Rail Pressure\b', 'Presión del rail'),
    (r'\bFuel Rail Temperature\b', 'Temperatura del rail'),
    (r'\bCommanded injection control pressure\b', 'Presión de control de inyección ordenada'),
    (r'\bInjection control pressure\b', 'Presión de control de inyección'),
    (r'\bCommanded boost pressure\b', 'Presión de turbo ordenada'),
    (r'\bBoost pressure sensor\b', 'Presión de turbo'),
    (r'\bBoost [bp]ressure (\w) control status\b', r'Control de presión de turbo \1'),
    (r'\bCommanded variable geometry turbo\b', 'Geometría variable del turbo ordenada'),
    (r'\bVariable geometry turbo (\w) control status\b', r'Control de geometría variable \1'),
    (r'\bVariable geometry turbo\b', 'Geometría variable del turbo'),
    (r'\bCommanded wastegate\b', 'Wastegate ordenada'),
    (r'\bWastegate\b', 'Wastegate'),
    (r'\bExhaust pressure\b', 'Presión de escape'),
    (r'\bTurbocharger (\w) speed\b', r'Régimen del turbo \1'),
    (r'\bTurbocharger (\w) compressor inlet temperature\b', r'Temperatura entrada compresor turbo \1'),
    (r'\bTurbocharger (\w) compressor outlet temperature\b', r'Temperatura salida compresor turbo \1'),
    (r'\bTurbocharger (\w) turbine inlet temperature\b', r'Temperatura entrada turbina \1'),
    (r'\bTurbocharger (\w) turbine outlet temperature\b', r'Temperatura salida turbina \1'),
    (r'\bCharge air cooler temperature\b', 'Temperatura del intercooler'),
    (r'\bExhaust gas temperature\b', 'Temperatura de escape'),
    (r'\bParticulate filter (bank \d) delta pressure\b', r'Presión diferencial del DPF \1'),
    (r'\bParticulate filter (bank \d) inlet pressure\b', r'Presión de entrada al DPF \1'),
    (r'\bParticulate filter (bank \d) outlet pressure\b', r'Presión de salida del DPF \1'),
    (r'\bParticulate filter (bank \d) inlet temperature\b', r'Temperatura de entrada al DPF \1'),
    (r'\bParticulate filter (bank \d) outlet temperature\b', r'Temperatura de salida del DPF \1'),
    (r'^Total run time with EI-AECD #(\d+) timer (\d)', r'Tiempo con EI-AECD nº \1, temporizador \2'),
    (r'^Corrected NOx concentration\b', 'NOx corregido'),
    (r'^NOx concentration\b', 'Concentración de NOx'),
    (r'^PM mass concentration\b', 'Concentración de partículas'),
    (r'^PM sensor (bank \d, sensor \d) regenerating', r'Sensor de partículas \1 regenerando'),
    (r'^PM sensor (bank \d, sensor \d) measuring', r'Sensor de partículas \1 midiendo'),
    (r'^PM sensor normalized output\b', 'Salida del sensor de partículas'),
    (r'^SCR inducement for NOx emissions too high', 'Limitación SCR por NOx alto'),
    (r'^SCR inducement for reagent consumption deviation', 'Limitación SCR por consumo de AdBlue anómalo'),
    (r'^SCR inducement for incorrect reagent', 'Limitación SCR por AdBlue incorrecto'),
    (r'^SCR inducement for reagent level too low', 'Limitación SCR por nivel de AdBlue bajo'),
    (r'^Distance with SCR inducement active in the current 10,000 km block', 'Distancia con limitación SCR en el bloque actual de 10.000 km'),
    (r'^Distance with SCR inducement active in the (.+) block', r'Distancia con limitación SCR en el bloque \1'),
    (r' in the (\d[\d,\-]* km) history block', r' (histórico \1)'),
    (r'^Idle fuel balance control (\d) in closed loop', r'Equilibrado de ralentí \1 en lazo cerrado'),
    (r'^Fuel injection timing control (\d) in closed loop', r'Avance de inyección \1 en lazo cerrado'),
    (r'^Fuel injection quantity control (\d) in closed loop', r'Cantidad de inyección \1 en lazo cerrado'),
    (r'^Fuel pressure control (\d) in closed loop', r'Presión de combustible \1 en lazo cerrado'),
    (r'^Cumulative engine hours with the continuous MI active', 'Horas acumuladas con el testigo fijo'),
    (r'^ECU engine hours with the continuous MI active', 'Horas de la centralita con el testigo fijo'),
    (r'^Engine hours with the continuous MI active', 'Horas con el testigo fijo'),
    (r'^Engine hours with incorrect reagent quality', 'Horas con AdBlue de mala calidad'),
    (r'^Engine hours with incorrect reagent consumption', 'Horas con consumo de AdBlue anómalo'),
    (r'^Engine hours with reagent dosing interrupted', 'Horas con la dosificación de AdBlue interrumpida'),
    (r'^Engine hours with an impeded EGR valve', 'Horas con la válvula EGR bloqueada'),
    (r'^Engine hours with a NOx control monitoring system fault', 'Horas con avería en el control de NOx'),
    (r'^Engine hours with the particulate filter removed or blocked', 'Horas con el DPF quitado u obstruido'),
    (r'^Engine hours with a liquid reagent injection system failure', 'Horas con avería en la inyección de AdBlue'),
    (r'^Engine hours with a particulate control monitoring system fault', 'Horas con avería en el control de partículas'),
    (r'^Particulate level (\w+) inducement status', r'Limitación por partículas nivel \1'),
    (r'^Level (\w+) inducement status', r'Limitación nivel \1'),
    (r'^Target SCR catalyst (\w) NH3 storage', r'NH3 objetivo en el catalizador SCR \1'),
    (r'^Actual SCR catalyst (\w) NH3 storage', r'NH3 real en el catalizador SCR \1'),
    (r'^Fuel system (\w) use percentage', r'Uso del sistema de combustible \1'),
    (r'^Fuel system bank (\d) in open loop due to a malfunction', r'Combustible banco \1 en lazo abierto por avería'),
    (r'^Fuel system bank (\d) in closed loop', r'Combustible banco \1 en lazo cerrado'),
    (r'^Fuel system bank (\d) in open loop', r'Combustible banco \1 en lazo abierto'),
    (r'^Mass Air Flow Sensor (\w)', r'Caudalímetro \1'),
    (r'^Alternative fuel rail pressure', 'Presión del rail (combustible alternativo)'),
    (r'^Alternative fuel rail temperature', 'Temperatura del rail (combustible alternativo)'),
    (r'^Alternative fuel tank pressure', 'Presión del depósito (combustible alternativo)'),
    (r'^Alternative fuel tank temperature', 'Temperatura del depósito (combustible alternativo)'),
    (r'^DEF doser (\w) dosing mode', r'Modo del dosificador de AdBlue \1'),
    (r'^DEF doser (\w) maximum dosing rate', r'Dosificación máxima de AdBlue \1'),
    (r'^DEF doser (\w) commanded dosing', r'Dosificación ordenada de AdBlue \1'),
    (r'^Fuel level input (\w)', r'Nivel de combustible \1'),
    (r'^Low-pressure fuel pressure (\w)', r'Presión de baja de combustible \1'),
    (r'^Electric motor (\w) speed', r'Régimen del motor eléctrico \1'),
    (r'^Electric motor (\w) torque', r'Par del motor eléctrico \1'),
    (r'^Catalyst temperature (\w)$', r'Temperatura del catalizador \1'),
    (r'^Evap system vapor pressure (\w)', r'Presión de vapor EVAP \1'),
    (r'^HV battery pack (\w) ', r'Batería AT, módulo \1: '),
    (r'^HV battery ', 'Batería AT: '),
    (r'actual charge rate', 'potencia de carga'),
    (r'minimum cell temperature', 'temperatura mínima de celda'),
    (r'maximum cell temperature', 'temperatura máxima de celda'),
    (r'average cell temperature', 'temperatura media de celda'),
    (r'bus bar temperature', 'temperatura de las pletinas'),
    (r'coolant temperature', 'temperatura del refrigerante'),
    (r'thermal state', 'estado térmico'),
    (r'active time since cell balancing', 'tiempo desde el equilibrado de celdas'),
    (r'minimum cell voltage', 'tensión mínima de celda'),
    (r'maximum cell voltage', 'tensión máxima de celda'),
    (r'continuous rated power available', 'potencia continua disponible'),
    (r'continuous charge current limit', 'límite de corriente de carga'),
    (r'continuous discharge current limit', 'límite de corriente de descarga'),
    (r'cumulative energy in', 'energía acumulada cargada'),
    (r'cumulative energy out', 'energía acumulada entregada'),
    (r'total energy throughput', 'energía total intercambiada'),
    (r'state of health', 'salud (SOH)'),
    (r'recommended minimum state of charge', 'carga mínima recomendada'),
    (r'recommended maximum state of charge', 'carga máxima recomendada'),
    (r'discharge energy capacity', 'capacidad de energía'),
    (r'remaining reserve energy', 'energía de reserva restante'),
    (r'initial reserve energy', 'energía de reserva inicial'),
    (r'charging limit', 'límite de carga'),
    (r'charging power', 'potencia de carga'),
    (r'power over the last second', 'potencia (último segundo)'),
    (r'current over the last second', 'corriente (último segundo)'),
    (r'calculated usable energy', 'energía útil calculada'),
    (r'temperature$', 'temperatura'),
    (r'current$', 'corriente'),
    (r'voltage$', 'tensión'),
    # palabras sueltas
    (r'\bbank (\d), sensor (\d)\b', r'B\1S\2'),
    (r'\bBank (\d), Sensor (\d)\b', r'B\1S\2'),
    (r'\(Bank (\d), Sensor (\d)\)', r'B\1S\2'),
    (r'\(bank (\d)\)', r'(banco \1)'),
    (r'\bbank (\d)\b', r'banco \1'),
    (r'\bsensor (\d)\b', r'sensor \1'),
    (r', wide range\b', ' (rango ampliado)'),
    (r'\(wide\)', '(rango ampliado)'),
    (r'\bthree\b', '3'), (r'\btwo\b', '2'), (r'\bone\b', '1'),
]

EXTRA = [
    ('Absence of reagent dosing counter', 'Contador de falta de dosificación de AdBlue'),
    ('Reagent consumption counter', 'Contador de consumo de AdBlue'), ('Reagent quality counter', 'Contador de calidad del AdBlue'),
    ('EGR valve counter', 'Contador de la válvula EGR'), ('Cumulative continuous MI counter', 'Contador acumulado del testigo fijo'),
    ('Liquid reagent injection system failure counter', 'Contador de averías de inyección de AdBlue'),
    ('Particulate filter removal or block counter', 'Contador de DPF quitado u obstruido'),
    ('Evap system sealing status', 'Estado de cierre EVAP'), ('Fuel cell current', 'Corriente de la pila de combustible'),
    ('Fuel cell energy', 'Energía de la pila de combustible'), ('Hybrid/EV Battery Current', 'Corriente de la batería híbrida/eléctrica'),
    ('Hybrid/EV Battery Voltage', 'Tensión de la batería híbrida/eléctrica'), ('Is ECT sensor 1', 'Sensor de temperatura del refrigerante 1'),
    ('Is ECT sensor 2', 'Sensor de temperatura del refrigerante 2'), ('Initial reserve energy', 'Energía de reserva inicial'),
    ('Remaining reserve energy', 'Energía de reserva restante'), ('NOx adsorber desulfurization status', 'Desulfuración del catalizador NOx'),
    ('NOx adsorber regen status', 'Regeneración del catalizador NOx'), ('NOx warning system activation status', 'Aviso de NOx'),
    ('Particulate filter regen status', 'Regeneración del DPF'), ('Particulate warning system activation status', 'Aviso de partículas'),
    ('Power Take Off (PTO) output status', 'Salida de toma de fuerza (PTO)'), ('Manual trans neutral gear status', 'Cambio manual en punto muerto'),
    ('Auto trans neutral drive status', 'Cambio automático en N/D'), ('Fuel Temperature A data', 'Temperatura del combustible A'),
    ('Fuel Temperature B data', 'Temperatura del combustible B'),
    ('Maximum value for air flow rate from mass air flow sensor', 'Máximo del caudalímetro'),
    ('Maximum value for equivalence ratio', 'Máximo de lambda'),
    ('Maximum value for intake manifold absolute pressure (MAP)', 'Máximo de presión del colector (MAP)'),
    ('Maximum value for oxygen sensor voltage', 'Máximo de tensión de sonda lambda'),
    ('Maximum value for oxygen sensor current', 'Máximo de corriente de sonda lambda'),
]
FRASES += EXTRA
TROZOS = [
    (r'^Engine Percent Torque At Idle, Point 1', 'Par del motor al ralentí (punto 1)'),
    (r'^Engine Percent Torque At Point (\d)', r'Par del motor (punto \1)'),
    (r'^Absolute throttle position (\w)$', r'Posición de la mariposa \1'),
    (r'^Wastegate (\w) position$', r'Posición de la wastegate \1'),
    (r'^Commanded VGT (\w) position$', r'Geometría variable \1 ordenada'),
    (r'^VGT (\w) position$', r'Posición de la geometría variable \1'),
    (r'^VGT (\w) control status$', r'Control de geometría variable \1'),
    (r'^Boost pressure (\w)$', r'Presión de turbo \1'),
    (r'^MAF Sensor (\w)$', r'Caudalímetro \1'),
    (r'^Turbo (\w) compressor inlet temperature', r'Temperatura entrada compresor turbo \1'),
    (r'^Turbo (\w) compressor outlet temperature', r'Temperatura salida compresor turbo \1'),
    (r'^Turbo (\w) turbine inlet temperature', r'Temperatura entrada turbina \1'),
    (r'^Turbo (\w) turbine outlet temperature', r'Temperatura salida turbina \1'),
    (r'^Total run time with EI-AECD #(\d+) active', r'Tiempo con EI-AECD nº \1 activa'),
    (r'^Total run time with EI-AECD #(\d+) timer (\d) active', r'Tiempo con EI-AECD nº \1 activa (temporizador \2)'),
    (r'^Commanded wastegate (\w) position', r'Wastegate \1 ordenada'),
    (r'^Commanded variable geometry turbo (\w) position', r'Geometría variable \1 ordenada'),
    (r'^Variable geometry turbo (\w) position', r'Posición de la geometría variable \1'),
    (r'^Wastegate (\w) position', r'Posición de la wastegate \1'),
    (r'^Intake air temperature, ', 'Temperatura de admisión '),
    (r'^Engine coolant temperature (\d)', r'Temperatura del refrigerante \1'),
    (r'^Absolute evap system vapor pressure', 'Presión de vapor EVAP (absoluta)'),
    (r'\(relative\)', '(relativo)'),
    (r'^Engine hours with a NOx control system fault', 'Horas con avería en el control de NOx'),
    (r'^Engine hours with a particulate control system fault', 'Horas con avería en el control de partículas'),
] + TROZOS

def traducir(nombre):
    m = re.match(r'^(.*?)\s+(?:data\s+)?supported\??$', nombre)
    if m and not re.search(r'monitoring supported$', nombre):
        return traducir(m.group(1)) + ' (disponible)'
    for en, es in FRASES:
        if nombre.lower() == en.lower():
            return es
    t = nombre
    for patron, es in TROZOS:
        t = re.sub(patron, es, t)
    t = re.sub(r'\s+', ' ', t).strip(' :')
    return t[:1].upper() + t[1:]

UNIDADES = {
    'percent': '%', 'celsius': '°C', 'seconds': 's', 'minutes': 'min', 'hours': 'h', 'kilopascal': 'kPa', 'volts': 'V',
    'amps': 'A', 'milliamps': 'mA', 'kilowatts': 'kW', 'kilowattHours': 'kWh', 'kilometers': 'km', 'rpm': 'rpm',
    'gramsPerSecond': 'g/s', 'newtonMeters': 'N·m', 'kilogramsPerHour': 'kg/h', 'gramsPerLiter': 'g/l', 'litersPerHour': 'l/h',
    'kilometersPerHour': 'km/h', 'degrees': '°', 'milligramsPerStroke': 'mg/emb', 'liters': 'l', 'scalar': '', 'hex': '',
    'noyes': 'sí/no', 'yesno': 'sí/no', 'offon': 'sí/no', None: '',
}

# Valores de las listas (por la clave «value» de OBDb)
VALORES = {
    'SPARK': 'Gasolina', 'COMPRESSION': 'Diésel',
    'OFF': 'Apagado', 'OL': 'Lazo abierto (sin condiciones)', 'CL': 'Lazo cerrado', 'OL-Drive': 'Lazo abierto por conducción',
    'OL-Fault': 'Lazo abierto por avería', 'CL-Fault': 'Lazo cerrado con avería de sonda', 'OL B2': 'Lazo abierto (banco 2)',
    'OL-Drive B2': 'Lazo abierto por conducción (banco 2)', 'OL-Drive B1+B2': 'Lazo abierto por conducción (bancos 1 y 2)', 'OL-Fault B2': 'Lazo abierto por avería (banco 2)',
    'UPS': 'Antes del catalizador', 'DNS': 'Después del catalizador', 'DIAG': 'Bomba activada para diagnosis',
    'GAS': 'Gasolina', 'METH': 'Metanol', 'ETH': 'Etanol', 'DSL': 'Diésel', 'LPG': 'GLP', 'CNG': 'GNC', 'PROP': 'Propano', 'ELEC': 'Eléctrico',
    'BI_GAS': 'Bifuel (gasolina)', 'BI_METH': 'Bifuel (metanol)', 'BI_ETH': 'Bifuel (etanol)', 'BI_LPG': 'Bifuel (GLP)', 'BI_CNG': 'Bifuel (GNC)',
    'BI_PROP': 'Bifuel (propano)', 'BI_ELEC': 'Bifuel (batería)', 'BI_MIX': 'Bifuel (batería y motor)', 'HYB_GAS': 'Híbrido gasolina',
    'HYB_ETH': 'Híbrido etanol', 'HYB_DSL': 'Híbrido diésel', 'HYB_ELEC': 'Híbrido (modo eléctrico)', 'HYB_MIX': 'Híbrido (batería y motor)',
    'HYB_REG': 'Híbrido (regenerando)', 'BI_DSL': 'Bifuel (diésel)', 'BI_NG': 'Bifuel (gas natural)', 'NG': 'Gas natural',
    'DSL_CNG': 'Diésel y GNC', 'DSL_LNG': 'Diésel y GNL', 'FC_H2': 'Pila de hidrógeno', 'HICE_HHO': 'Motor de hidrógeno', 'KERO': 'Queroseno', 'HFO': 'Fuelóleo',
    'NO OBD': 'Sin OBD', 'Passive': 'Pasiva', 'Active': 'Activa', 'Complete': 'Completos', 'Not complete': 'Sin completar',
    'Off': 'Apagado', 'On demand': 'A petición', 'Short': 'Corto', 'Continuous': 'Fijo', 'Error': 'Error', 'Not available': 'No disponible',
    'Non-discriminatory': 'No discriminatoria', 'Discriminatory': 'Discriminatoria', 'Inactive': 'Inactiva', 'Enabled': 'Preparada',
    'Not supported': 'No soportada', 'CSM': 'Mantener carga', 'CDM': 'Gastar carga', 'CIM': 'Aumentar carga', 'Not PSA': 'No aplicable',
    'Urea too high': 'Urea demasiado alta', 'Urea too low': 'Urea demasiado baja', 'Diesel or other': 'Gasoil u otro líquido',
    'Proper mixture': 'Correcto', 'Unknown': 'Desconocido', 'Sensor fault': 'Avería del sensor', 'Active cooling': 'Refrigeración activa',
    'Passive cooling': 'Refrigeración pasiva', 'Active heating': 'Calefacción activa', 'Passive heating': 'Calefacción pasiva',
    'On': 'Encendido', 'Blink': 'Parpadeando', 'Not used': 'No usado', 'Not ready': 'No listo', 'Ready': 'Listo',
}
def valor_lista(v):
    val = v.get('value', '')
    for pref in ('BP_A_', 'BP_B_', 'VGT_A_', 'VGT_B_'):
        if val.startswith(pref):
            val = {'OL': 'Lazo abierto', 'CL': 'Lazo cerrado', 'FAULT': 'Avería'}[val[len(pref):]]
            return val
    return VALORES.get(val, val)

GRUPOS = {
    'Engine.Generic': 'motor', 'Engine.Generic.OxygenSensors': 'lambda', 'Engine.Generic.AuxInputs': 'motor', 'Fuel.Generic': 'combustible',
    'Emissions.Generic': 'emisiones', 'Battery.Generic': 'bateria', 'Control.Generic': 'motor', 'Control.Pedals.Generic': 'motor',
    'Movement.Generic': 'vehiculo', 'Trips.Generic': 'vehiculo', 'Clocks.Generic': 'vehiculo', 'Climate.Generic': 'motor',
    'DTCs.Generic': 'obd', 'DTCs.Generic.Status': 'obd', 'DTCs.Generic.Support': 'obd', 'OBD.Generic': 'obd',
}

def num(x):
    return int(x) if isinstance(x, (int, float)) and float(x).is_integer() else x

def main():
    d = json.loads(ORIGEN.read_text())
    salida = {}
    sin_traducir = set()
    for c in d['commands']:
        pid = int(c['cmd']['01'], 16)
        senales = []
        for s in c['signals']:
            f = s['fmt']
            e = {'id': s['id'], 'n': traducir(s['name']), 'bix': f.get('bix', 0), 'len': f['len']}
            if re.search(r'[A-Za-z]{4,}', e['n']) and e['n'] == s['name'][:1].upper() + s['name'][1:]:
                sin_traducir.add(s['name'])
            for k in ('mul', 'div', 'add', 'min', 'max', 'nullmax', 'nullmin'):
                if k in f: e[k] = num(f[k])
            if f.get('sign'): e['sign'] = 1
            u = f.get('unit')
            if u in ('noyes', 'yesno', 'offon'): e['si'] = 1
            elif UNIDADES.get(u): e['u'] = UNIDADES[u]
            # Erratas de la base comprobadas contra la fórmula del estándar
            if s['id'] == 'FUEL_TIMING': e['add'] = -210  # (256A+B)/128 − 210; OBDb trae −38665
            # Unidades que OBDb no pone y conversiones de taller
            if re.match(r'^NOXC?\d\d$', s['id']): e['u'] = 'ppm'
            elif re.match(r'^PM\d\d$', s['id']): e['u'] = 'mg/m³'
            elif re.match(r'^(LAMBDA\d\d|EQ_RAT)$', s['id']): e['u'] = 'λ'
            if re.match(r'^(FRP|ICP)', s['id']) and e.get('u') == 'kPa':
                e['u'] = 'bar'; e['div'] = e.get('div', 1) * 100
                for k in ('min', 'max', 'nullmax', 'nullmin'):
                    if k in e: e[k] = num(round(e[k] / 100, 4))
            if f.get('map'):
                e['map'] = {int(k): valor_lista(v) for k, v in f['map'].items()}
            if s.get('hidden'): e['oculta'] = 1
            g = GRUPOS.get(s.get('path', ''))
            if g: e['g'] = g
            senales.append(e)
        # Bit de «dato disponible» (sup) o «no disponible» (na) de cada señal, para no mostrar lo que el coche no tiene
        por_id = {e['id']: e for e in senales}
        ESPECIALES = {'GEAR_SUP': ['GEAR_RCMD'], 'GPL_SUP': ['GPL_STAT'], 'N/G_SUP': ['N/G_STAT'], 'N/D_SUP': ['N/D_STAT'],
                      'PTO_SUP': ['PTO_STAT_AUX'], 'RTP_A_SUP': ['TP_A_REL'], 'RTP_B_SUP': ['TP_B_REL'],
                      'CTAC_A_SUP': ['TAC_A_CMD'], 'CTAC_B_SUP': ['TAC_B_CMD']}
        for e in senales:
            if not e.get('oculta') or e['len'] != 1: continue
            i = e['id']
            destinos = ESPECIALES.get(i, [])
            m = re.match(r'^AECD(\d+)_SUP$', i)
            if m: destinos = [f'AECD{m.group(1)}_TIME1', f'AECD{m.group(1)}_TIME2']
            m = re.match(r'^(PM\d\d)_STAT_SUP$', i)
            if m: destinos = [f'{m.group(1)}_REGEN', f'{m.group(1)}_ACTIVE']
            m = re.match(r'^(FUELSYS\d)_SUP$', i)
            if m and m.group(1) + '_CL' in por_id: destinos = [m.group(1) + x for x in ('_OL_FAULT', '_CL', '_OL')]
            if not destinos and i.endswith('_SUP') and i[:-4] in por_id: destinos = [i[:-4]]
            for d in destinos:
                if d in por_id: por_id[d]['sup'] = e['bix']
            if i.endswith('_NA') and i[:-3] in por_id: por_id[i[:-3]]['na'] = e['bix']
        salida[pid] = {'freq': c.get('freq'), 's': senales}
    cab = f"""// Reyman Diag · PID estándar del servicio 01 (SAE J1979), bit a bit.
// GENERADO por scripts/generar-sae-pids.py — no editar a mano.
// Basado en la base abierta OBDb «SAEJ1979» (https://github.com/OBDb/SAEJ1979, versión {VERSION}),
// licencia Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Este archivo es una obra derivada
// (traducción al español y cambio de formato) y se distribuye con la misma licencia: ver data/obdb/LICENSE.
// bix = primer bit (0 = bit 7 del byte A), len = nº de bits; valor = crudo × mul ÷ div + add.
"""
    js = cab + 'export const SAE_PIDS = ' + json.dumps({f'0x{k:02X}': v for k, v in sorted(salida.items())}, ensure_ascii=False, separators=(',', ':')).replace('"0x', '0x').replace('":{"freq"', ':{"freq"') + ';\n'
    js = re.sub(r'"(0x[0-9A-F]{2})":', r'\1:', js)
    DESTINO.write_text(js)
    print(f'{len(salida)} PID, {sum(len(v["s"]) for v in salida.values())} señales -> {DESTINO.relative_to(RAIZ)}')
    if sin_traducir:
        print('Sin traducir:', len(sin_traducir))
        for n in sorted(sin_traducir): print('  ', n)

if __name__ == '__main__':
    main()
