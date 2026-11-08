// Genera dist/reyman-diag-demo.html: la app completa en un solo archivo, en modo demostración (simulador, sin servidor).
import { build } from 'esbuild';
import fs from 'node:fs/promises';

const r = await build({ entryPoints: ['apps/taller/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = r.outputFiles[0].text;
const css = await fs.readFile('apps/taller/styles.css', 'utf8');
const logo = (await fs.readFile('apps/taller/logo.png')).toString('base64');
// Formato de artifact: sin doctype/html/head/body (los pone la plataforma). Abrible también como archivo suelto.
const html = `<title>Reyman Diag</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<script>window.REYMAN_DIAG_DEMO=true;window.REYMAN_LOGO='data:image/png;base64,${logo}';</script>
<div id="app"><main><p style="padding:24px">Cargando Reyman Diag…</p></main></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>`;
await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/reyman-diag-demo.html', html);
console.log(`dist/reyman-diag-demo.html (${Math.round(html.length / 1024)} KB)`);
