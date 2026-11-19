// App Reyman (app instalable) · prepara los proyectos nativos después de «npx cap add android|ios»
// (las carpetas android/ e ios/ no se guardan en el repositorio): permisos de cámara y fotos (fotos y vídeos de las OT),
// ubicación (fichaje de jornada, 19/11/2026), notificaciones (iOS, 20/11/2026),
// enlace «reyman://» (para que Reyman Diag pueda volver a la App Reyman) e icono.
//   node scripts/preparar-nativo.mjs android
//   node scripts/preparar-nativo.mjs ios
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(DIR, 'assets');
const ESQUEMA = 'reyman';            // reyman://… abre esta app
const OTRAS = ['reymandiag'];        // apps que abre (Reyman Diag)
const plataforma = process.argv[2];

if (plataforma === 'android') {
  const f = path.join(DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  let x = fs.readFileSync(f, 'utf8');
  const permisos = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  ].filter((p) => !x.includes(p.match(/android:name="([^"]+)"/)[1] + '"'));
  x = x.replace('</manifest>', `    ${permisos.join('\n    ')}\n</manifest>`);
  // reyman://  → abre la App Reyman
  if (!x.includes(`android:scheme="${ESQUEMA}"`)) {
    x = x.replace(/(<activity[\s\S]*?<\/intent-filter>)/, `$1\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="${ESQUEMA}" />\n            </intent-filter>`);
  }
  // Android 11+: poder abrir Reyman Diag
  if (!x.includes('<queries>')) x = x.replace('</manifest>', `    <queries>\n${OTRAS.map((s) => `        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="${s}" /></intent>`).join('\n')}\n    </queries>\n</manifest>`);
  fs.writeFileSync(f, x);
  // Icono
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
    NSCameraUsageDescription: 'La App Reyman usa la cámara para las fotos y vídeos de las órdenes de trabajo y de la recepción del coche.',
    NSMicrophoneUsageDescription: 'La App Reyman usa el micrófono al grabar vídeos de las órdenes de trabajo.',
    NSPhotoLibraryUsageDescription: 'La App Reyman usa tus fotos para añadirlas a las órdenes de trabajo.',
    NSPhotoLibraryAddUsageDescription: 'La App Reyman guarda en tus fotos las imágenes que descargas.',
    // Fichaje de jornada: si el taller lo activa, se comprueba que se ficha en el taller (sin esta clave iOS cierra la app al pedir la ubicación)
    NSLocationWhenInUseUsageDescription: 'La App Reyman comprueba al fichar la jornada si estás en el taller (solo si el taller lo tiene activado).',
  };
  for (const [k, v] of Object.entries(claves)) if (!x.includes(`<key>${k}</key>`)) x = x.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  // Sin cifrado propio (solo HTTPS del sistema): TestFlight no pregunta por la exportación en cada versión
  if (!x.includes('ITSAppUsesNonExemptEncryption')) x = x.replace(/<dict>/, '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  // reyman:// abre esta app; puede abrir reymandiag:// (Reyman Diag)
  if (!x.includes('<key>CFBundleURLTypes</key>')) x = x.replace(/<dict>/, `<dict>\n\t<key>CFBundleURLTypes</key>\n\t<array><dict><key>CFBundleURLName</key><string>es.talleresreyman.app</string><key>CFBundleURLSchemes</key><array><string>${ESQUEMA}</string></array></dict></array>`);
  if (!x.includes('<key>LSApplicationQueriesSchemes</key>')) x = x.replace(/<dict>/, `<dict>\n\t<key>LSApplicationQueriesSchemes</key>\n\t<array>${OTRAS.map((s) => `<string>${s}</string>`).join('')}</array>`);
  fs.writeFileSync(f, x);
  // Icono: una sola imagen de 1024 px (Xcode genera el resto)
  const set = path.join(DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  fs.mkdirSync(set, { recursive: true });
  for (const a of fs.readdirSync(set)) if (a.endsWith('.png')) fs.unlinkSync(path.join(set, a));
  fs.copyFileSync(path.join(ASSETS, 'icono-1024.png'), path.join(set, 'AppIcon-1024.png'));
  fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
  // Notificaciones (APNs, 20/11/2026): permiso «aps-environment» (TestFlight y App Store usan el entorno de producción),
  // que lo use el proyecto y que el AppDelegate pase el token del iPhone al plugin @capacitor/push-notifications
  const ent = path.join(DIR, 'ios', 'App', 'App', 'App.entitlements');
  fs.writeFileSync(ent, '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>aps-environment</key>\n\t<string>production</string>\n</dict>\n</plist>\n');
  const pbx = path.join(DIR, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  let px = fs.readFileSync(pbx, 'utf8');
  if (!px.includes('CODE_SIGN_ENTITLEMENTS')) px = px.replace(/(\n(\t+)PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g, '\n$2CODE_SIGN_ENTITLEMENTS = App/App.entitlements;$1');
  fs.writeFileSync(pbx, px);
  const del = path.join(DIR, 'ios', 'App', 'App', 'AppDelegate.swift');
  let ad = fs.readFileSync(del, 'utf8');
  if (!ad.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
    const metodos = `
    // Notificaciones: el token del iPhone (o el error) al plugin de Capacitor
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
    const i = ad.lastIndexOf('}');
    ad = ad.slice(0, i) + metodos + ad.slice(i);
    fs.writeFileSync(del, ad);
  }
  console.log('Info.plist: cámara, fotos, micrófono, ubicación y enlace ' + ESQUEMA + ':// · icono · notificaciones (aps-environment, AppDelegate)');
} else {
  console.error('Uso: node scripts/preparar-nativo.mjs android|ios');
  process.exit(1);
}
