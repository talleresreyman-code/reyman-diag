-- CVN (servicio 09): lo que se ha leído de cada software (CALID) en cada coche, y las referencias de fábrica
CREATE TABLE IF NOT EXISTS diag_cvn (
  tenant_id  text NOT NULL,
  calid      text NOT NULL,
  cvn        text NOT NULL,
  vin        text NOT NULL,
  matricula  text,
  ecu        text,
  primera    timestamptz NOT NULL DEFAULT now(),
  ultima     timestamptz NOT NULL DEFAULT now(),
  veces      integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, calid, cvn, vin)
);
CREATE TABLE IF NOT EXISTS diag_cvn_ref (
  tenant_id  text NOT NULL,
  calid      text NOT NULL,
  cvn        text NOT NULL,
  usuario    text,
  vin        text,
  creada     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, calid)
);
