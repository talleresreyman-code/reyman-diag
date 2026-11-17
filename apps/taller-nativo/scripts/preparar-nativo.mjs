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
  // reymandiag://…  → abre Reyman Diag (desde la App Reyman, con la OT y la matrícula)
  if (!x.includes('android:scheme="reymandiag"')) {
    x = x.replace(/(<activity[\s\S]*?<\/intent-filter>)/, '$1\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="reymandiag" />\n            </intent-filter>');
  }
  // Android 11+: poder abrir la App Reyman (reyman://)
  if (!x.includes('<queries>')) x = x.replace('</manifest>', '    <queries>\n        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="reyman" /></intent>\n    </queries>\n</manifest>');
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
  // reymandiag:// abre esta app (desde la App Reyman); puede abrir reyman:// (volver a la App Reyman)
  if (!x.includes('<key>CFBundleURLTypes</key>')) x = x.replace(/<dict>/, '<dict>\n\t<key>CFBundleURLTypes</key>\n\t<array><dict><key>CFBundleURLName</key><string>es.talleresreyman.diag</string><key>CFBundleURLSchemes</key><array><string>reymandiag</string></array></dict></array>');
  if (!x.includes('<key>LSApplicationQueriesSchemes</key>')) x = x.replace(/<dict>/, '<dict>\n\t<key>LSApplicationQueriesSchemes</key>\n\t<array><string>reyman</string></array>');
  fs.writeFileSync(f, x);
  console.log('Info.plist: permisos de Bluetooth y red local · enlace reymandiag://');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
