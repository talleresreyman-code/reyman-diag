// App Reyman · da de alta el identificador de la app (es.talleresreyman.app) en la cuenta de Apple,
// con la clave de App Store Connect. Así en App Store Connect ya sale en la lista al crear la app.
// Uso (en GitHub Actions): node scripts/registrar-bundle.mjs  (con ASC_KEY_ID, ASC_ISSUER_ID y ASC_KEY_P8)
import crypto from 'node:crypto';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('../capacitor.config.json', import.meta.url)));
const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const datos = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({ iss, iat: ahora, exp: ahora + 600, aud: 'appstoreconnect-v1' })}`;
const firma = crypto.sign('sha256', Buffer.from(datos), { key: p8, dsaEncoding: 'ieee-p1363' }).toString('base64url');
const H = { Authorization: `Bearer ${datos}.${firma}`, 'Content-Type': 'application/json' };
const API = 'https://api.appstoreconnect.apple.com/v1';

const r = await fetch(`${API}/bundleIds?filter[identifier]=${cfg.appId}`, { headers: H });
const lista = await r.json();
if (lista.data?.some((b) => b.attributes.identifier === cfg.appId)) {
  console.log(`Identificador ${cfg.appId} ya dado de alta`);
} else {
  const c = await fetch(`${API}/bundleIds`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'bundleIds', attributes: { identifier: cfg.appId, name: cfg.appName, platform: 'IOS' } } }) });
  console.log(c.ok ? `Identificador ${cfg.appId} dado de alta` : `No se ha podido dar de alta: ${c.status} ${await c.text()}`);
}
// Notificaciones (APNs): el identificador necesita la función «Push Notifications»
const bid = (await (await fetch(`${API}/bundleIds?filter[identifier]=${cfg.appId}`, { headers: H })).json()).data?.find((b) => b.attributes.identifier === cfg.appId);
if (bid) {
  const caps = await (await fetch(`${API}/bundleIds/${bid.id}/bundleIdCapabilities`, { headers: H })).json();
  if (caps.data?.some((x) => x.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) console.log('Notificaciones ya activadas en el identificador');
  else {
    const c = await fetch(`${API}/bundleIdCapabilities`, { method: 'POST', headers: H, body: JSON.stringify({ data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bid.id } } } } }) });
    console.log(c.ok ? 'Notificaciones activadas en el identificador' : `::warning::No se han podido activar las notificaciones: ${c.status} ${await c.text()}`);
  }
}
const apps = await (await fetch(`${API}/apps?filter[bundleId]=${cfg.appId}`, { headers: H })).json();
if (!apps.data?.length) {
  console.log(`::warning::Falta crear la app «${cfg.appName}» en App Store Connect (Apps → + → Nueva app, ID de paquete ${cfg.appId}). Sin eso no se puede subir a TestFlight.`);
  process.exit(1);
}
console.log(`App «${cfg.appName}» encontrada en App Store Connect`);
