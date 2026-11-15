// Reyman Diag · módulo nativo para la web del taller (apps/taller/lib/nativo.js).
// La web del taller va sin empaquetar (módulos ES + importmap); los plugins de Capacitor (Bluetooth y Wi-Fi
// directos) sí necesitan empaquetarse. Se genera aquí y se sube al repositorio: el servidor no compila nada.
// Solo se carga dentro de la app instalada (Capacitor); en el navegador no se usa.
//   cd apps/taller-nativo && npm install && npm run nativo
import { build } from '../apps/taller-nativo/node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  stdin: {
    contents: "export { Capacitor } from '@capacitor/core';\nexport { BleClient } from '@capacitor-community/bluetooth-le';\nexport { TcpSocket } from 'capacitor-tcp-socket';\n",
    resolveDir: path.join(RAIZ, 'apps', 'taller-nativo'),
    loader: 'js',
  },
  bundle: true, format: 'esm', minify: true, target: 'es2020',
  banner: { js: '// Generado por scripts/build-nativo.js · no editar a mano' },
  outfile: path.join(RAIZ, 'apps', 'taller', 'lib', 'nativo.js'),
});
console.log('apps/taller/lib/nativo.js generado');
