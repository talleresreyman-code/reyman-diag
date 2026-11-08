// Reyman Connect · compilación
//   node scripts/build.js         → www/ (lo que empaqueta Capacitor para iPhone y Android)
//   node scripts/build.js --demo  → dist/reyman-connect-demo.html (un solo archivo, modo demostración con simulador)
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(DIR, '..', '..', 'packages', 'obd-core', 'src');
const demo = process.argv.includes('--demo');

const r = await build({
  entryPoints: [path.join(DIR, 'src', 'app.js')], bundle: true, format: 'iife', minify: true, write: false, target: ['es2020', 'safari15'],
  alias: { '@reyman/obd-core': CORE }, nodePaths: [path.join(DIR, 'node_modules')],
});
const js = r.outputFiles[0].text;
const css = await fs.readFile(path.join(DIR, 'src', 'styles.css'), 'utf8');

if (!demo) {
  const www = path.join(DIR, 'www');
  await fs.rm(www, { recursive: true, force: true });
  await fs.mkdir(www, { recursive: true });
  await fs.writeFile(path.join(www, 'app.js'), js);
  await fs.copyFile(path.join(DIR, 'src', 'index.html'), path.join(www, 'index.html'));
  await fs.writeFile(path.join(www, 'styles.css'), css);
  await fs.copyFile(path.join(DIR, 'src', 'logo.png'), path.join(www, 'logo.png'));
  console.log(`www/ listo (app.js ${Math.round(js.length / 1024)} KB)`);
} else {
  const logo = (await fs.readFile(path.join(DIR, 'src', 'logo.png'))).toString('base64');
  const html = `<title>Reyman Connect</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<script>window.REYMAN_CONNECT_DEMO=true;window.REYMAN_LOGO='data:image/png;base64,${logo}';</script>
<div id="app"><main><p style="padding:24px">Cargando Reyman Connect…</p></main></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>`;
  await fs.mkdir(path.join(DIR, 'dist'), { recursive: true });
  await fs.writeFile(path.join(DIR, 'dist', 'reyman-connect-demo.html'), html);
  console.log(`dist/reyman-connect-demo.html (${Math.round(html.length / 1024)} KB)`);
}
