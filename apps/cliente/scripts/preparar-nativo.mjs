// Reyman Connect · añade a los proyectos nativos los permisos que piden los plugins (Bluetooth y red local).
// Se ejecuta después de «npx cap add android|ios» (las plataformas nativas no se guardan en el repositorio).
//   node scripts/preparar-nativo.mjs android
//   node scripts/preparar-nativo.mjs ios
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plataforma = process.argv[2];

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
  ].filter((p) => !x.includes(p.match(/android:name="([^"]+)"/)[1] + '"'));
  x = x.replace('</manifest>', `    ${permisos.join('\n    ')}\n</manifest>`);
  fs.writeFileSync(f, x);
  console.log(`AndroidManifest.xml: ${permisos.length} permisos añadidos`);
} else if (plataforma === 'ios') {
  const f = path.join(DIR, 'ios', 'App', 'App', 'Info.plist');
  let x = fs.readFileSync(f, 'utf8');
  const claves = {
    NSBluetoothAlwaysUsageDescription: 'Reyman Connect usa el Bluetooth para conectar con el adaptador OBD de tu coche.',
    NSLocalNetworkUsageDescription: 'Reyman Connect se conecta por Wi-Fi con el adaptador OBD de tu coche (por ejemplo, WiCAN Pro).',
  };
  for (const [k, v] of Object.entries(claves)) if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  fs.writeFileSync(f, x);
  console.log('Info.plist: permisos de Bluetooth y red local');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
