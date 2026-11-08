// Reyman Diag · acceso único con la App Reyman
// La App Reyman guarda la sesión en una cookie httpOnly. Si esa cookie se emite para el dominio
// ".talleresreyman.es", el navegador la envía también a diag.talleresreyman.es y aquí la reenviamos
// a la App Reyman para saber quién es el usuario, su rol y su taller. No guardamos contraseñas ni PIN.

export const PERMISOS = {
  'diag.ver': 'Abrir Reyman Diag',
  'diag.leer': 'Conectar con el coche y leer',
  'diag.borrar': 'Borrar averías del coche',
  'diag.enviar_cliente': 'Enviar el informe al cliente',
  'diag.ia': 'Usar el diagnóstico con IA',
  'diag.historial': 'Ver el registro de borrados',
};

// Si la App Reyman todavía no tiene permisos "diag.*" en su catálogo, se usan estos por rol.
const POR_ROL = {
  admin: ['diag.*'],
  administracion: ['diag.*'],
  oficina: ['diag.ver', 'diag.leer', 'diag.enviar_cliente', 'diag.ia', 'diag.historial'],
  mecanico: ['diag.ver', 'diag.leer', 'diag.borrar', 'diag.ia'],
};

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function permisosDe(usuario) {
  const propios = (usuario.permisos || []).filter((p) => p === '*' || p.startsWith('diag.'));
  if (propios.length) return propios.includes('*') ? ['diag.*'] : propios;
  return POR_ROL[sinTildes(usuario.rol)] || [];
}

export function tiene(permisos, p) {
  return permisos.includes('diag.*') || permisos.includes(p);
}

/**
 * Crea el resolvedor de sesión.
 * modo "app-reyman": pregunta a la App Reyman (APP_REYMAN_URL + APP_REYMAN_YO) reenviando la cookie.
 * modo "dev": usuario de prueba (solo para desarrollo; el rol se elige con la cabecera x-diag-rol).
 */
export function crearAuth(cfg) {
  const cache = new Map(); // cookie -> { hasta, sesion }

  async function desdeAppReyman(req) {
    const cookie = req.headers.cookie;
    if (!cookie) return null;
    const c = cache.get(cookie);
    if (c && c.hasta > Date.now()) return c.sesion;
    const r = await fetch(new URL(cfg.appReymanYo, cfg.appReymanUrl), {
      headers: { cookie, accept: 'application/json', 'x-reyman-app': 'diag', 'x-forwarded-host': req.headers.host || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) throw new Error(`La App Reyman respondió ${r.status}`);
    const d = await r.json();
    if (d.mfa) return null; // falta la verificación en dos pasos: que entre primero en la App Reyman
    const u = d.usuario || d.yo || d.user || d;
    const taller = d.taller || d.tenant || {};
    const sesion = {
      usuario: { id: String(u.id ?? u.usuario_id ?? ''), nombre: u.nombre || u.name || 'Usuario', rol: u.rol || u.role || '' },
      tenant: String(taller.id ?? taller.slug ?? taller.tenant_id ?? u.tenant_id ?? cfg.tenantPorDefecto),
      taller: { nombre: taller.nombre || taller.marca?.nombre || 'Talleres Reyman' },
      permisos: permisosDe(u),
    };
    cache.set(cookie, { hasta: Date.now() + 60_000, sesion });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return sesion;
  }

  function desdeDev(req) {
    const rol = req.headers['x-diag-rol'] || cfg.devRol || 'mecanico';
    return {
      usuario: { id: `dev-${rol}`, nombre: `Prueba (${rol})`, rol },
      tenant: req.headers['x-diag-taller'] || cfg.tenantPorDefecto,
      taller: { nombre: 'Talleres Reyman' },
      permisos: permisosDe({ rol }),
    };
  }

  return async function sesion(req) {
    return cfg.modo === 'dev' ? desdeDev(req) : desdeAppReyman(req);
  };
}
