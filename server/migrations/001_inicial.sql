-- Reyman Diag · esquema inicial
-- Todas las tablas cuelgan de tenant_id (mismo identificador de taller que la App Reyman).
-- Las tablas de registro son de solo añadir: un trigger impide borrar o modificar.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS diag_lecturas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  ot            text,
  matricula     text,
  vin           text,
  usuario_id    text,
  usuario       text,
  lectura       jsonb NOT NULL,
  averias       text[] NOT NULL DEFAULT '{}',
  semaforo_itv  text,
  ia            jsonb,
  creada        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diag_lecturas_matricula ON diag_lecturas (tenant_id, matricula, creada DESC);
CREATE INDEX IF NOT EXISTS diag_lecturas_vin ON diag_lecturas (tenant_id, vin, creada DESC);
CREATE INDEX IF NOT EXISTS diag_lecturas_ot ON diag_lecturas (tenant_id, ot);

-- Registro de borrados de averías: se crea ANTES de enviar el modo 04 al coche y se completa una sola vez con el resultado.
CREATE TABLE IF NOT EXISTS diag_borrados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  lectura_id   uuid REFERENCES diag_lecturas(id),
  ot           text,
  matricula    text,
  vin          text,
  codigos      text[] NOT NULL,
  motivo       text,
  usuario_id   text,
  usuario      text,
  ip           text,
  dispositivo  text,
  pedido_en    timestamptz NOT NULL DEFAULT now(),
  resultado    jsonb,
  resuelto_en  timestamptz
);
CREATE INDEX IF NOT EXISTS diag_borrados_tenant ON diag_borrados (tenant_id, pedido_en DESC);

CREATE OR REPLACE FUNCTION diag_borrados_proteger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'diag_borrados es un registro: no se puede borrar';
  END IF;
  IF OLD.resultado IS NOT NULL THEN
    RAISE EXCEPTION 'diag_borrados: el resultado ya está registrado y no se puede cambiar';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.codigos <> OLD.codigos
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id OR NEW.pedido_en <> OLD.pedido_en
     OR NEW.lectura_id IS DISTINCT FROM OLD.lectura_id OR NEW.motivo IS DISTINCT FROM OLD.motivo THEN
    RAISE EXCEPTION 'diag_borrados: solo se puede añadir el resultado';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS diag_borrados_proteger ON diag_borrados;
CREATE TRIGGER diag_borrados_proteger BEFORE UPDATE OR DELETE ON diag_borrados
  FOR EACH ROW EXECUTE FUNCTION diag_borrados_proteger();

-- Sesiones de datos en vivo (pruebas de carretera). n8n las copia a OneDrive y la app vacía las muestras.
CREATE TABLE IF NOT EXISTS diag_sesiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  lectura_id    uuid REFERENCES diag_lecturas(id),
  ot            text,
  matricula     text,
  vin           text,
  usuario       text,
  inicio        timestamptz,
  duracion_s    integer,
  pids          jsonb NOT NULL,
  muestras      jsonb,
  num_muestras  integer NOT NULL DEFAULT 0,
  onedrive      text,
  subida_en     timestamptz,
  creada        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diag_sesiones_pendientes ON diag_sesiones (tenant_id) WHERE subida_en IS NULL;

-- Uso de la IA (para el tope mensual de coste)
CREATE TABLE IF NOT EXISTS diag_ia_uso (
  id          bigserial PRIMARY KEY,
  tenant_id   text NOT NULL,
  lectura_id  uuid,
  usuario     text,
  modelo      text,
  tokens_in   integer,
  tokens_out  integer,
  coste_eur   numeric(10,4) NOT NULL DEFAULT 0,
  creada      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diag_ia_uso_mes ON diag_ia_uso (tenant_id, creada);

-- Historial general (envíos al cliente, uso de IA, accesos): solo añadir
CREATE TABLE IF NOT EXISTS diag_auditoria (
  id          bigserial PRIMARY KEY,
  tenant_id   text NOT NULL,
  usuario     text,
  accion      text NOT NULL,
  detalle     jsonb,
  ip          text,
  creada      timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION diag_solo_anadir() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% es de solo añadir', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS diag_auditoria_proteger ON diag_auditoria;
CREATE TRIGGER diag_auditoria_proteger BEFORE UPDATE OR DELETE ON diag_auditoria
  FOR EACH ROW EXECUTE FUNCTION diag_solo_anadir();
DROP TRIGGER IF EXISTS diag_ia_uso_proteger ON diag_ia_uso;
CREATE TRIGGER diag_ia_uso_proteger BEFORE UPDATE OR DELETE ON diag_ia_uso
  FOR EACH ROW EXECUTE FUNCTION diag_solo_anadir();
