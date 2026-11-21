// Reyman Connect · añade a los proyectos nativos los permisos que piden los plugins (Bluetooth y red local).
// Se ejecuta después de «npx cap add android|ios» (las plataformas nativas no se guardan en el repositorio).
//   node scripts/preparar-nativo.mjs android
//   node scripts/preparar-nativo.mjs ios
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plataforma = process.argv[2];
const ASSETS = path.join(DIR, 'assets'); // icono con la silueta y el nombre de Talleres Reyman

if (plataforma === 'android') {
  const f = path.join(DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  let x = fs.readFileSync(f, 'utf8');
  if (!x.includes('xmlns:tools=')) x = x.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
  const permisos = [
    '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
    '<uses-permission android:name="android.permission.USE_BIOMETRIC" />',
  ].filter((p) => !x.includes(p.match(/android:name="([^"]+)"/)[1] + '"'));
  x = x.replace('</manifest>', `    ${permisos.join('\n    ')}\n</manifest>`);
  // Enlace reymanconnect://mitaller?t=… (página «abrir la app» del taller): abre la app ya vinculada
  if (!x.includes('android:scheme="reymanconnect"')) {
    x = x.replace(/(<activity[^>]*MainActivity[\s\S]*?)(<\/activity>)/, `$1    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="reymanconnect" />
            </intent-filter>
        $2`);
  }
  fs.writeFileSync(f, x);
  // Icono (normal, redondo y adaptativo con fondo azul Reyman)
  const res = path.join(DIR, 'android', 'app', 'src', 'main', 'res');
  for (const d of fs.readdirSync(path.join(ASSETS, 'android'))) {
    fs.mkdirSync(path.join(res, d), { recursive: true });
    for (const a of fs.readdirSync(path.join(ASSETS, 'android', d))) fs.copyFileSync(path.join(ASSETS, 'android', d, a), path.join(res, d, a));
  }
  const fondo = path.join(res, 'values', 'ic_launcher_background.xml');
  fs.mkdirSync(path.dirname(fondo), { recursive: true });
  fs.writeFileSync(fondo, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D57A5</color>\n</resources>\n');
  console.log(`AndroidManifest.xml: ${permisos.length} permisos añadidos · icono`);
} else if (plataforma === 'ios') {
  const f = path.join(DIR, 'ios', 'App', 'App', 'Info.plist');
  let x = fs.readFileSync(f, 'utf8');
  const claves = {
    NSBluetoothAlwaysUsageDescription: 'Reyman Connect usa el Bluetooth para conectar con el adaptador OBD de tu coche.',
    NSLocalNetworkUsageDescription: 'Reyman Connect se conecta por Wi-Fi con el adaptador OBD de tu coche (por ejemplo, WiCAN Pro).',
    NSFaceIDUsageDescription: 'Reyman Connect usa Face ID para proteger tu ficha del taller si pierdes el móvil.',
  };
  for (const [k, v] of Object.entries(claves)) if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  // Enlace reymanconnect://mitaller?t=… (página «abrir la app» del taller): abre la app ya vinculada
  if (!x.includes('<string>reymanconnect</string>')) x = x.replace(/<dict>/, '<dict>\n\t<key>CFBundleURLTypes</key>\n\t<array><dict><key>CFBundleURLName</key><string>es.talleresreyman.connect</string><key>CFBundleURLSchemes</key><array><string>reymanconnect</string></array></dict></array>');
  // Sin cifrado propio (solo HTTPS del sistema): así TestFlight no pregunta por la exportación en cada versión
  if (!x.includes('ITSAppUsesNonExemptEncryption')) x = x.replace(/<dict>/, '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  fs.writeFileSync(f, x);
  // Icono (1024 × 1024; iOS hace el resto de tamaños)
  const set = path.join(DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  fs.mkdirSync(set, { recursive: true });
  for (const a of fs.readdirSync(set)) if (a.endsWith('.png')) fs.rmSync(path.join(set, a));
  fs.copyFileSync(path.join(ASSETS, 'icono-1024.png'), path.join(set, 'AppIcon-1024.png'));
  fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
  console.log('Info.plist: permisos de Bluetooth y red local · icono');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
