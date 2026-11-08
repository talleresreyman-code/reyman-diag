-- Visor de grabaciones: las sesiones se quedan en la base (además de la copia en OneDrive) y llevan sus marcas
ALTER TABLE diag_sesiones ADD COLUMN IF NOT EXISTS eventos jsonb;
CREATE INDEX IF NOT EXISTS diag_sesiones_buscar ON diag_sesiones (tenant_id, matricula, creada DESC);
