// Reyman Diag (app de taller) · añade a los proyectos nativos los permisos de Bluetooth y red local.
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
  // La API del WiCAN Pro va por http:// en la red local (192.168.0.10)
  if (!x.includes('usesCleartextTraffic')) x = x.replace('<application ', '<application android:usesCleartextTraffic="true" ');
  fs.writeFileSync(f, x);
  console.log(`AndroidManifest.xml: ${permisos.length} permisos añadidos`);
} else if (plataforma === 'ios') {
  const f = path.join(DIR, 'ios', 'App', 'App', 'Info.plist');
  let x = fs.readFileSync(f, 'utf8');
  const claves = {
    NSBluetoothAlwaysUsageDescription: 'Reyman Diag usa el Bluetooth para conectar con el adaptador OBD del coche (vLinker, WiCAN).',
    NSLocalNetworkUsageDescription: 'Reyman Diag se conecta por Wi-Fi con el adaptador OBD del coche (WiCAN Pro).',
  };
  for (const [k, v] of Object.entries(claves)) if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  // Peticiones http:// a la red local (API del WiCAN Pro en 192.168.0.10); internet sigue solo por https
  if (!x.includes('<key>NSAppTransportSecurity</key>')) x = x.replace(/<dict>/, '<dict>\n\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>');
  // Sin cifrado propio (solo HTTPS del sistema): así TestFlight no pregunta por la exportación en cada versión
  if (!x.includes('ITSAppUsesNonExemptEncryption')) x = x.replace(/<dict>/, '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  fs.writeFileSync(f, x);
  console.log('Info.plist: permisos de Bluetooth y red local');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
