-- Grabación automática de cada sesión de diagnóstico (comunicación completa, lecturas y los dos informes)
CREATE TABLE IF NOT EXISTS diag_registros (
  tenant_id        text NOT NULL,
  id               text NOT NULL,
  ot               text,
  matricula        text,
  vin              text,
  usuario          text,
  inicio           timestamptz,
  actualizado      timestamptz NOT NULL DEFAULT now(),
  terminada        boolean NOT NULL DEFAULT false,
  datos            jsonb NOT NULL,
  informe_taller   text,
  informe_cliente  text,
  subido           timestamptz,
  onedrive         text,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS diag_registros_pendientes ON diag_registros (tenant_id) WHERE subido IS NULL OR subido < actualizado;
