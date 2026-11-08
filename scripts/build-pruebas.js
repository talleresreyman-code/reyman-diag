// Genera dist/Reyman_Diag_WiFi/: paquete de pruebas para el portátil con Windows.
// - reyman-diag.html: la app completa en un solo archivo, en modo pruebas (adaptador real, sin servidor).
// - puente.ps1 + «Iniciar Reyman Diag WiFi.bat»: programa de enlace (sirve la app en localhost:35001 y hace de puente Wi-Fi).
// - LEEME.txt: instrucciones.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const r = await build({
  entryPoints: ['apps/taller/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  alias: { '@reyman/obd-core': path.resolve('packages/obd-core/src') },
});
const js = r.outputFiles[0].text;
const css = await fs.readFile('apps/taller/styles.css', 'utf8');
const logo = (await fs.readFile('apps/taller/logo.png')).toString('base64');
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
// Documento completo: el programa de enlace lo sirve tal cual. Sin internet (el portátil está en la red del adaptador): todo va dentro.
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reyman Diag · pruebas v${version}</title>
<style>${css}</style>
<script>window.REYMAN_DIAG_PRUEBAS=true;window.REYMAN_LOGO='data:image/png;base64,${logo}';</script>
</head><body>
<div id="app"><main><p style="padding:24px">Cargando Reyman Diag…</p></main></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
</body></html>`;
const dir = path.join('dist', 'Reyman_Diag_WiFi');
await fs.rm(dir, { recursive: true, force: true });
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, 'reyman-diag.html'), html);
for (const f of ['puente.ps1', 'j2534puente.cs', 'Iniciar Reyman Diag.bat', 'LEEME.txt']) await fs.copyFile(path.join('deploy', 'pruebas-wifi', f), path.join(dir, f));
console.log(`${dir}/ (app ${Math.round(html.length / 1024)} KB, v${version})`);
