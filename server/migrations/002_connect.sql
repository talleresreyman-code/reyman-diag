-- Reyman Connect · avisos que envían los clientes desde la app («Mi taller»)
-- Solo llegan si el cliente ha vinculado el taller y ha aceptado el consentimiento.

CREATE TABLE IF NOT EXISTS connect_avisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  codigo_taller   text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('estado', 'cita')),
  matricula       text,
  vin             text,
  km              integer,
  vehiculo        jsonb,
  averias         jsonb NOT NULL DEFAULT '[]',
  bateria         jsonb,
  contacto        jsonb,
  mensaje         text,
  consentimiento  jsonb NOT NULL,
  ip              text,
  creada          timestamptz NOT NULL DEFAULT now(),
  atendido_en     timestamptz,
  atendido_por    text
);
CREATE INDEX IF NOT EXISTS connect_avisos_tenant ON connect_avisos (tenant_id, creada DESC);
CREATE INDEX IF NOT EXISTS connect_avisos_pendientes ON connect_avisos (tenant_id) WHERE atendido_en IS NULL;
