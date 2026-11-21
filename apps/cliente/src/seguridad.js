// Reyman Connect · seguridad en el móvil
//
//  · Bloqueo con Face ID / Touch ID / huella, o con el código del móvil si falla (plugin @capgo/capacitor-native-biometric).
//    Obligatorio mientras la app guarde la ficha del cliente: si se pierde el móvil, nadie ve sus datos.
//  · Pantalla de privacidad: en el selector de apps se ve borroso (iOS) o atenuado (Android), no la ficha (@capacitor/privacy-screen).
//  · Reglas de caducidad y de bloqueo al volver del segundo plano (lógica pura, probada en test/connect-seguridad.test.js).
//
// En el navegador (demostración y pruebas) no hay bloqueo: todo devuelve «disponible» y «desbloqueado».

export const VERSION_CONDICIONES = '2026-11-21'; // si cambian las condiciones o la política, se vuelven a aceptar
export const BLOQUEO_TRAS_MS = 60 * 1000; // vuelve a pedir Face ID si la app ha estado más de 1 minuto en segundo plano
export const FICHA_CADUCA_DIAS = 90; // sin abrir la ficha en 90 días, se borra del móvil y hay que volver a vincular

const esNativa = () => !!globalThis.Capacitor?.isNativePlatform?.();

// OJO: los plugins de Capacitor son «proxies» que responden también a «then»: se guardan en variables, nunca se devuelven desde una función async.
let bio, privacidad;
async function plugins() {
  if (bio !== undefined) return;
  bio = privacidad = null;
  if (!esNativa()) return;
  try { bio = (await import('@capgo/capacitor-native-biometric')).NativeBiometric; } catch { bio = null; }
  try { privacidad = (await import('@capacitor/privacy-screen')).PrivacyScreen; } catch { privacidad = null; }
}

/** ¿Puede el móvil proteger la app? { disponible, tipo: 'Face ID' | 'Touch ID' | 'huella' | 'código' | null } */
export async function proteccionDisponible() {
  await plugins();
  if (!esNativa()) return { disponible: true, tipo: null, web: true };
  if (!bio) return { disponible: false, tipo: null };
  try {
    const r = await bio.isAvailable({ useFallback: true });
    return { disponible: !!r?.isAvailable, tipo: nombreTipo(r?.biometryType) };
  } catch { return { disponible: false, tipo: null }; }
}

export function nombreTipo(t) {
  return { 1: 'Touch ID', 2: 'Face ID', 3: 'huella', 4: 'reconocimiento facial', 5: 'iris', 6: 'huella o cara', 7: 'código del móvil' }[t] || 'código del móvil';
}

/**
 * Pide Face ID / huella (y, si falla, el código del móvil).
 * Devuelve { ok: true } o { ok: false, cancelado, bloqueado, error }.
 */
export async function verificar(motivo = 'Para abrir tu ficha de Talleres Reyman') {
  await plugins();
  if (!esNativa()) return { ok: true };
  if (!bio) return { ok: false, error: 'Este móvil no permite proteger la app.' };
  try {
    await bio.verifyIdentity({
      reason: motivo, title: 'Reyman Connect', subtitle: motivo, negativeButtonText: 'Cancelar',
      useFallback: true, fallbackTitle: 'Usar código', maxAttempts: 5,
      allowedBiometryTypes: [3, 4, 5, 7], // Android: huella, cara, iris o el PIN/patrón del móvil
    });
    return { ok: true };
  } catch (e) {
    const c = Number(e?.code ?? e?.data?.code);
    return { ok: false, cancelado: [11, 15, 16].includes(c) || /cancel/i.test(e?.message || ''), bloqueado: c === 2 || c === 4, sinCodigo: c === 14 || c === 1, error: e?.message || 'No se ha podido comprobar tu identidad.' };
  }
}

/** Oculta el contenido en el selector de apps y en las capturas del sistema. */
export async function activarPrivacidad() {
  await plugins();
  try { await privacidad?.enable({ android: { dimBackground: true, privacyModeOnActivityHidden: 'dim' }, ios: { blurEffect: 'dark' } }); } catch { /* no es grave */ }
}

// ---------------------------------------------------------------------------
// Reglas (puras)
// ---------------------------------------------------------------------------
/** ¿Hay que aceptar las condiciones (primera vez o han cambiado)? */
export const faltaConsentimiento = (datos) => datos?.consentimiento?.version !== VERSION_CONDICIONES;

/** ¿Hay que bloquear al volver del segundo plano? */
export const bloquearAlVolver = (ocultaDesde, ahora = Date.now()) => !!ocultaDesde && ahora - ocultaDesde >= BLOQUEO_TRAS_MS;

/** ¿La ficha guardada en el móvil ha caducado por no usarla? */
export function fichaCaducada(cliente, ahora = Date.now()) {
  if (!cliente) return false;
  const ultimo = Date.parse(cliente.ultimoUso || cliente.desde || '');
  if (!Number.isFinite(ultimo)) return false;
  return ahora - ultimo > FICHA_CADUCA_DIAS * 86400000;
}

/** El servidor dice que el enlace ya no vale (desactivado o no existe): hay que borrar la ficha del móvil. */
export const accesoRevocado = (e) => e?.revocado === true;
