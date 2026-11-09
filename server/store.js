// Reyman Diag · almacenamiento
// "pg": Postgres (producción). "memoria": para desarrollo y tests, sin base de datos.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const DIR_MIGRACIONES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function crearStore(tipo, opciones = {}) {
  return tipo === 'pg' ? storePg(opciones) : storeMemoria();
}

function resumen(lectura) {
  const averias = [...new Set((lectura?.averias || []).map((a) => a.codigo))];
  return { averias, semaforo: lectura?.readiness?.semaforo || null };
}

// ---------------------------------------------------------------------------
async function storePg({ url }) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  const q = (sql, p) => pool.query(sql, p);

  return {
    tipo: 'pg',
    async migrar() {
      await q('CREATE TABLE IF NOT EXISTS diag_migraciones (nombre text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now())');
      const hechas = new Set((await q('SELECT nombre FROM diag_migraciones')).rows.map((r) => r.nombre));
      const ficheros = (await fs.readdir(DIR_MIGRACIONES)).filter((f) => f.endsWith('.sql')).sort();
      for (const f of ficheros) {
        if (hechas.has(f)) continue;
        const sql = await fs.readFile(path.join(DIR_MIGRACIONES, f), 'utf8');
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query(sql);
          await c.query('INSERT INTO diag_migraciones (nombre) VALUES ($1)', [f]);
          await c.query('COMMIT');
        } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
      }
    },
    async crearLectura(t, d) {
      const r = resumen(d.lectura);
      const { rows } = await q(
        `INSERT INTO diag_lecturas (tenant_id, ot, matricula, vin, usuario_id, usuario, lectura, averias, semaforo_itv)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, creada`,
        [t, d.ot, d.matricula, d.vin, d.usuario_id, d.usuario, d.lectura, r.averias, r.semaforo],
      );
      return rows[0];
    },
    async listarLecturas(t, { matricula, vin, ot, limite = 30 }) {
      const cond = ['tenant_id = $1'];
      const p = [t];
      if (matricula) { p.push(matricula); cond.push(`matricula = $${p.length}`); }
      if (vin) { p.push(vin); cond.push(`vin = $${p.length}`); }
      if (ot) { p.push(ot); cond.push(`ot = $${p.length}`); }
      p.push(limite);
      const { rows } = await q(`SELECT id, ot, matricula, vin, usuario, lectura, ia, creada FROM diag_lecturas WHERE ${cond.join(' AND ')} ORDER BY creada DESC LIMIT $${p.length}`, p);
      return rows;
    },
    async obtenerLectura(t, id) {
      const { rows } = await q('SELECT * FROM diag_lecturas WHERE tenant_id = $1 AND id = $2', [t, id]);
      return rows[0] || null;
    },
    async guardarIaLectura(t, id, ia) {
      await q('UPDATE diag_lecturas SET ia = $3 WHERE tenant_id = $1 AND id = $2', [t, id, ia]);
    },
    async crearBorrado(t, d) {
      const { rows } = await q(
        `INSERT INTO diag_borrados (tenant_id, lectura_id, ot, matricula, vin, codigos, motivo, usuario_id, usuario, ip, dispositivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [t, d.lectura_id, d.ot, d.matricula, d.vin, d.codigos, d.motivo, d.usuario_id, d.usuario, d.ip, d.dispositivo],
      );
      return rows[0];
    },
    async resolverBorrado(t, id, usuarioId, resultado) {
      const { rowCount } = await q(
        'UPDATE diag_borrados SET resultado = $4, resuelto_en = now() WHERE tenant_id = $1 AND id = $2 AND usuario_id IS NOT DISTINCT FROM $3 AND resultado IS NULL',
        [t, id, usuarioId, resultado],
      );
      return rowCount > 0;
    },
    async listarBorrados(t, limite = 100) {
      const { rows } = await q('SELECT * FROM diag_borrados WHERE tenant_id = $1 ORDER BY pedido_en DESC LIMIT $2', [t, limite]);
      return rows;
    },
    async crearSesion(t, d) {
      const { rows } = await q(
        `INSERT INTO diag_sesiones (tenant_id, lectura_id, ot, matricula, vin, usuario, inicio, duracion_s, pids, muestras, num_muestras, eventos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [t, d.lectura_id, d.ot, d.matricula, d.vin, d.usuario, d.inicio, d.duracion_s, JSON.stringify(d.pids), JSON.stringify(d.muestras), d.muestras.length, JSON.stringify(d.eventos || [])],
      );
      return rows[0];
    },
    async listarSesiones(t, { matricula, ot, vin, limite = 50 } = {}) {
      const { rows } = await q(
        `SELECT id, ot, matricula, vin, usuario, inicio, duracion_s, num_muestras, pids, onedrive, creada, (muestras IS NOT NULL) AS con_datos
           FROM diag_sesiones WHERE tenant_id = $1 AND ($2::text IS NULL OR matricula = $2) AND ($3::text IS NULL OR ot = $3) AND ($4::text IS NULL OR vin = $4)
          ORDER BY creada DESC LIMIT $5`,
        [t, matricula || null, ot || null, vin || null, limite],
      );
      return rows;
    },
    async obtenerSesion(t, id) {
      const { rows } = await q('SELECT * FROM diag_sesiones WHERE tenant_id = $1 AND id = $2', [t, id]);
      return rows[0] || null;
    },
    async sesionesPendientes(t, limite = 20) {
      const { rows } = await q('SELECT * FROM diag_sesiones WHERE tenant_id = $1 AND subida_en IS NULL ORDER BY creada LIMIT $2', [t, limite]);
      return rows;
    },
    async marcarSesionSubida(t, id, destino) {
      const { rowCount } = await q('UPDATE diag_sesiones SET subida_en = now(), onedrive = $3 WHERE tenant_id = $1 AND id = $2', [t, id, destino]);
      return rowCount > 0;
    },
    async guardarRegistro(t, d) {
      const { rows } = await q(
        `INSERT INTO diag_registros (tenant_id, id, ot, matricula, vin, usuario, inicio, terminada, datos, informe_taller, informe_cliente)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, id) DO UPDATE SET ot = EXCLUDED.ot, matricula = EXCLUDED.matricula, vin = EXCLUDED.vin, terminada = EXCLUDED.terminada,
           datos = EXCLUDED.datos, informe_taller = EXCLUDED.informe_taller, informe_cliente = EXCLUDED.informe_cliente, actualizado = now()
         RETURNING actualizado`,
        [t, d.id, d.ot, d.matricula, d.vin, d.usuario, d.inicio, !!d.terminada, JSON.stringify(d.datos), d.informe_taller, d.informe_cliente],
      );
      return rows[0];
    },
    async registrosPendientes(t, limite = 10) {
      const { rows } = await q('SELECT * FROM diag_registros WHERE tenant_id = $1 AND (subido IS NULL OR subido < actualizado) ORDER BY actualizado LIMIT $2', [t, limite]);
      return rows;
    },
    async marcarRegistroSubido(t, id, actualizado, destino) {
      // Solo se da por subida la versión que se copió: si se ha vuelto a guardar después, queda pendiente
      const { rowCount } = await q(
        "UPDATE diag_registros SET subido = actualizado, onedrive = $4 WHERE tenant_id = $1 AND id = $2 AND actualizado <= $3::timestamptz + interval '1 millisecond'",
        [t, id, actualizado, destino],
      );
      if (rowCount) return true;
      return (await q('SELECT 1 FROM diag_registros WHERE tenant_id = $1 AND id = $2', [t, id])).rowCount > 0;
    },
    async cvnDatos(t, calid, vin) {
      const ref = (await q('SELECT cvn, creada FROM diag_cvn_ref WHERE tenant_id = $1 AND calid = $2', [t, calid])).rows[0] || null;
      const propias = (await q('SELECT cvn, primera, ultima FROM diag_cvn WHERE tenant_id = $1 AND calid = $2 AND vin = $3', [t, calid, vin])).rows;
      const otros = (await q('SELECT cvn, COUNT(DISTINCT vin)::int AS coches FROM diag_cvn WHERE tenant_id = $1 AND calid = $2 AND vin <> $3 GROUP BY cvn', [t, calid, vin])).rows;
      return { ref, propias, otros };
    },
    async cvnApuntar(t, d) {
      await q(`INSERT INTO diag_cvn (tenant_id, calid, cvn, vin, matricula, ecu) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (tenant_id, calid, cvn, vin) DO UPDATE SET ultima = now(), veces = diag_cvn.veces + 1, matricula = COALESCE(EXCLUDED.matricula, diag_cvn.matricula)`,
      [t, d.calid, d.cvn, d.vin, d.matricula || null, d.ecu || null]);
    },
    async cvnReferencia(t, d) {
      await q(`INSERT INTO diag_cvn_ref (tenant_id, calid, cvn, usuario, vin) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (tenant_id, calid) DO UPDATE SET cvn = EXCLUDED.cvn, usuario = EXCLUDED.usuario, vin = EXCLUDED.vin, creada = now()`,
      [t, d.calid, d.cvn, d.usuario || null, d.vin || null]);
    },
    async gastoIaMes(t) {
      const { rows } = await q("SELECT COALESCE(SUM(coste_eur),0)::float AS total FROM diag_ia_uso WHERE tenant_id = $1 AND creada >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'", [t]);
      return rows[0].total;
    },
    async registrarIa(t, d) {
      await q('INSERT INTO diag_ia_uso (tenant_id, lectura_id, usuario, modelo, tokens_in, tokens_out, coste_eur) VALUES ($1,$2,$3,$4,$5,$6,$7)', [t, d.lectura_id, d.usuario, d.modelo, d.tokens_in, d.tokens_out, d.coste_eur]);
    },
    async auditar(t, d) {
      await q('INSERT INTO diag_auditoria (tenant_id, usuario, accion, detalle, ip) VALUES ($1,$2,$3,$4,$5)', [t, d.usuario, d.accion, d.detalle || null, d.ip || null]);
    },
    async crearAvisoConnect(t, d) {
      const { rows } = await q(
        `INSERT INTO connect_avisos (tenant_id, codigo_taller, tipo, matricula, vin, km, vehiculo, averias, bateria, contacto, mensaje, consentimiento, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, creada`,
        [t, d.codigo_taller, d.tipo, d.matricula, d.vin, d.km, d.vehiculo, JSON.stringify(d.averias || []), d.bateria, d.contacto, d.mensaje, d.consentimiento, d.ip],
      );
      return rows[0];
    },
    async listarAvisosConnect(t, { pendientes = false, limite = 100 } = {}) {
      const { rows } = await q(`SELECT * FROM connect_avisos WHERE tenant_id = $1 ${pendientes ? 'AND atendido_en IS NULL' : ''} ORDER BY creada DESC LIMIT $2`, [t, limite]);
      return rows;
    },
    async atenderAvisoConnect(t, id, usuario) {
      const { rowCount } = await q('UPDATE connect_avisos SET atendido_en = now(), atendido_por = $3 WHERE tenant_id = $1 AND id = $2 AND atendido_en IS NULL', [t, id, usuario]);
      return rowCount > 0;
    },
    async cerrar() { await pool.end(); },
  };
}

// ---------------------------------------------------------------------------
function storeMemoria() {
  const db = { lecturas: [], borrados: [], sesiones: [], ia: [], auditoria: [], connect: [], cvn: [], cvnRef: [], registros: [] };
  const id = () => crypto.randomUUID();
  const de = (t, lista) => lista.filter((x) => x.tenant_id === t);
  return {
    tipo: 'memoria',
    _db: db,
    async migrar() {},
    async crearLectura(t, d) {
      const r = { id: id(), tenant_id: t, ...d, ...resumen(d.lectura), ia: null, creada: new Date() };
      db.lecturas.push(r);
      return { id: r.id, creada: r.creada };
    },
    async listarLecturas(t, { matricula, vin, ot, limite = 30 }) {
      return de(t, db.lecturas)
        .filter((l) => (!matricula || l.matricula === matricula) && (!vin || l.vin === vin) && (!ot || l.ot === ot))
        .sort((a, b) => b.creada - a.creada).slice(0, limite);
    },
    async obtenerLectura(t, i) { return de(t, db.lecturas).find((l) => l.id === i) || null; },
    async guardarIaLectura(t, i, ia) { const l = de(t, db.lecturas).find((x) => x.id === i); if (l) l.ia = ia; },
    async crearBorrado(t, d) { const r = { id: id(), tenant_id: t, ...d, pedido_en: new Date(), resultado: null }; db.borrados.push(r); return r; },
    async resolverBorrado(t, i, usuarioId, resultado) {
      const b = de(t, db.borrados).find((x) => x.id === i && x.usuario_id === usuarioId && x.resultado === null);
      if (!b) return false;
      b.resultado = resultado; b.resuelto_en = new Date();
      return true;
    },
    async listarBorrados(t) { return de(t, db.borrados).slice().reverse(); },
    async crearSesion(t, d) { const r = { id: id(), tenant_id: t, ...d, num_muestras: d.muestras.length, subida_en: null, creada: new Date() }; db.sesiones.push(r); return { id: r.id }; },
    async sesionesPendientes(t) { return de(t, db.sesiones).filter((s) => !s.subida_en); },
    async marcarSesionSubida(t, i, destino) { const s = de(t, db.sesiones).find((x) => x.id === i); if (!s) return false; s.subida_en = new Date(); s.onedrive = destino; return true; },
    async listarSesiones(t, { matricula, ot, vin, limite = 50 } = {}) {
      return de(t, db.sesiones).filter((s) => (!matricula || s.matricula === matricula) && (!ot || s.ot === ot) && (!vin || s.vin === vin))
        .sort((a, b) => b.creada - a.creada).slice(0, limite)
        .map(({ muestras, tenant_id: _t, ...s }) => ({ ...s, con_datos: !!muestras }));
    },
    async obtenerSesion(t, i) { return de(t, db.sesiones).find((s) => s.id === i) || null; },
    async guardarRegistro(t, d) {
      const r = de(t, db.registros).find((x) => x.id === d.id);
      const actualizado = new Date(Math.max(Date.now(), (r?.actualizado?.getTime() || 0) + 1));
      if (r) Object.assign(r, d, { actualizado }); else db.registros.push({ tenant_id: t, ...d, actualizado, subido: null });
      return { actualizado };
    },
    async registrosPendientes(t) { return de(t, db.registros).filter((r) => !r.subido || r.subido < r.actualizado); },
    async marcarRegistroSubido(t, i, actualizado, destino) { const r = de(t, db.registros).find((x) => x.id === i); if (!r) return false; if (r.actualizado <= new Date(actualizado)) { r.subido = r.actualizado; r.onedrive = destino; } return true; },
    async cvnDatos(t, calid, vin) {
      const ref = de(t, db.cvnRef).find((r) => r.calid === calid) || null;
      const filas = de(t, db.cvn).filter((r) => r.calid === calid);
      const propias = filas.filter((r) => r.vin === vin);
      const por = new Map();
      for (const r of filas.filter((x) => x.vin !== vin)) por.set(r.cvn, (por.get(r.cvn) || new Set()).add(r.vin));
      return { ref, propias, otros: [...por].map(([cvn, v]) => ({ cvn, coches: v.size })) };
    },
    async cvnApuntar(t, d) {
      const r = de(t, db.cvn).find((x) => x.calid === d.calid && x.cvn === d.cvn && x.vin === d.vin);
      if (r) { r.ultima = new Date(); r.veces++; } else db.cvn.push({ tenant_id: t, ...d, primera: new Date(), ultima: new Date(), veces: 1 });
    },
    async cvnReferencia(t, d) {
      db.cvnRef = db.cvnRef.filter((x) => !(x.tenant_id === t && x.calid === d.calid));
      db.cvnRef.push({ tenant_id: t, ...d, creada: new Date() });
    },
    async gastoIaMes(t) {
      const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
      return de(t, db.ia).filter((x) => x.creada >= ini).reduce((s, x) => s + x.coste_eur, 0);
    },
    async registrarIa(t, d) { db.ia.push({ tenant_id: t, ...d, creada: new Date() }); },
    async auditar(t, d) { db.auditoria.push({ tenant_id: t, ...d, creada: new Date() }); },
    async crearAvisoConnect(t, d) { const r = { id: id(), tenant_id: t, ...d, creada: new Date(), atendido_en: null, atendido_por: null }; db.connect.push(r); return { id: r.id, creada: r.creada }; },
    async listarAvisosConnect(t, { pendientes = false } = {}) { return de(t, db.connect).filter((a) => !pendientes || !a.atendido_en).slice().reverse(); },
    async atenderAvisoConnect(t, i, usuario) { const a = de(t, db.connect).find((x) => x.id === i && !x.atendido_en); if (!a) return false; a.atendido_en = new Date(); a.atendido_por = usuario; return true; },
    async cerrar() {},
  };
}
