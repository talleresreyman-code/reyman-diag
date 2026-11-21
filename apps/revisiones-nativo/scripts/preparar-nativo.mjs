// Revisiones (app instalable) · prepara los proyectos nativos después de «npx cap add android|ios»
// (las carpetas android/ e ios/ no se guardan en el repositorio): permisos de cámara y fotos (fotos de las inspecciones),
// enlace «reymanrev://» (para que la App Reyman pueda abrir Revisiones) e icono.
//   node scripts/preparar-nativo.mjs android
//   node scripts/preparar-nativo.mjs ios
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(DIR, 'assets');
const ESQUEMA = 'reymanrev';         // reymanrev://… abre esta app
const OTRAS = ['reyman'];            // apps que abre (App Reyman)
const plataforma = process.argv[2];

if (plataforma === 'android') {
  const f = path.join(DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  let x = fs.readFileSync(f, 'utf8');
  const permisos = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  ].filter((p) => !x.includes(p.match(/android:name="([^"]+)"/)[1] + '"'));
  x = x.replace('</manifest>', `    ${permisos.join('\n    ')}\n</manifest>`);
  if (!x.includes(`android:scheme="${ESQUEMA}"`)) {
    x = x.replace(/(<activity[\s\S]*?<\/intent-filter>)/, `$1\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="${ESQUEMA}" />\n            </intent-filter>`);
  }
  if (!x.includes('<queries>')) x = x.replace('</manifest>', `    <queries>\n${OTRAS.map((s) => `        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="${s}" /></intent>`).join('\n')}\n    </queries>\n</manifest>`);
  fs.writeFileSync(f, x);
  const res = path.join(DIR, 'android', 'app', 'src', 'main', 'res');
  for (const d of fs.readdirSync(path.join(ASSETS, 'android'))) {
    fs.mkdirSync(path.join(res, d), { recursive: true });
    for (const a of fs.readdirSync(path.join(ASSETS, 'android', d))) fs.copyFileSync(path.join(ASSETS, 'android', d, a), path.join(res, d, a));
  }
  const fondo = path.join(res, 'values', 'ic_launcher_background.xml');
  fs.mkdirSync(path.dirname(fondo), { recursive: true });
  fs.writeFileSync(fondo, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F2732</color>\n</resources>\n');
  console.log(`AndroidManifest.xml: ${permisos.length} permisos, enlace ${ESQUEMA}:// e icono`);
} else if (plataforma === 'ios') {
  const f = path.join(DIR, 'ios', 'App', 'App', 'Info.plist');
  let x = fs.readFileSync(f, 'utf8');
  const claves = {
    NSCameraUsageDescription: 'Revisiones usa la cámara para las fotos de las inspecciones de los vehículos.',
    NSPhotoLibraryUsageDescription: 'Revisiones usa tus fotos para añadirlas a las inspecciones.',
    NSPhotoLibraryAddUsageDescription: 'Revisiones guarda en tus fotos las imágenes que descargas.',
  };
  for (const [k, v] of Object.entries(claves)) if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  if (!x.includes('ITSAppUsesNonExemptEncryption')) x = x.replace(/<dict>/, '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  if (!x.includes('<key>CFBundleURLTypes</key>')) x = x.replace(/<dict>/, `<dict>\n\t<key>CFBundleURLTypes</key>\n\t<array><dict><key>CFBundleURLName</key><string>es.talleresreyman.revisiones</string><key>CFBundleURLSchemes</key><array><string>${ESQUEMA}</string></array></dict></array>`);
  if (!x.includes('<key>LSApplicationQueriesSchemes</key>')) x = x.replace(/<dict>/, `<dict>\n\t<key>LSApplicationQueriesSchemes</key>\n\t<array>${OTRAS.map((s) => `<string>${s}</string>`).join('')}</array>`);
  fs.writeFileSync(f, x);
  const set = path.join(DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  fs.mkdirSync(set, { recursive: true });
  for (const a of fs.readdirSync(set)) if (a.endsWith('.png')) fs.unlinkSync(path.join(set, a));
  fs.copyFileSync(path.join(ASSETS, 'icono-1024.png'), path.join(set, 'AppIcon-1024.png'));
  fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
  console.log('Info.plist: cámara, fotos y enlace ' + ESQUEMA + ':// · icono');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
