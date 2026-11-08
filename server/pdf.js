// Reyman Diag · informe PDF en el servidor (para enviarlo al cliente por correo)
import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'logo.png');
const AZUL = '#143f7a';
const GRIS = '#66717f';
const TIPO = { confirmada: 'Confirmada', pendiente: 'Pendiente', permanente: 'Permanente' };
const SEM = {
  verde: ['Preparado para ITV (emisiones)', '#1e8a4c'],
  amarillo: ['Autodiagnóstico pendiente de completar', '#b97f00'],
  rojo: ['No apto: avería de emisiones activa', '#c4302a'],
};

/** Genera el PDF y devuelve un Buffer. version: 'cliente' | 'interno'. */
export function pdfInforme(fila, { version = 'cliente', taller = 'Talleres Reyman, S.L.', iaTexto = null } = {}) {
  const l = fila.lectura || {};
  const cliente = version === 'cliente';
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 50, left: 46, right: 46 }, info: { Title: 'Informe de diagnosis', Author: taller } });
    const partes = [];
    doc.on('data', (b) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    const ancho = doc.page.width - 92;

    if (fs.existsSync(LOGO)) doc.image(LOGO, 46, 40, { height: 46 });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(AZUL).text('Informe de diagnosis', 46, 44, { width: ancho, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(new Date(fila.creada || l.fecha).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' }), { width: ancho, align: 'right' });
    doc.moveTo(46, 96).lineTo(46 + ancho, 96).lineWidth(2).strokeColor('#1d57a5').stroke();
    doc.y = 108;

    const v = l.vehiculo || {};
    const datos = [
      ['Matrícula', fila.matricula || '—'], ['Vehículo', [v.marca, v.año].filter(Boolean).join(' · ') || '—'],
      ['Bastidor', v.vin || fila.vin || (v.valido === false ? 'No lo da por OBD' : '—')], ['Orden de trabajo', fila.ot || '—'],
      ['Kilómetros', String(l.datos?.find((d) => d.pid === 0xa6)?.valor ?? '—')],
    ];
    const x0 = 46; let y = doc.y; const col = ancho / 3;
    datos.forEach(([k, val], i) => {
      const x = x0 + (i % 3) * col; const yy = y + Math.floor(i / 3) * 34;
      doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(k, x, yy, { width: col - 8 });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#232a33').text(val, x, yy + 11, { width: col - 8 });
    });
    doc.y = y + 76;

    if (cliente) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#454f5b').text('Este informe recoge lo que el vehículo tiene registrado en su sistema de autodiagnóstico (OBD). Un código indica qué sistema ha detectado un problema; la causa exacta se confirma con las comprobaciones del taller.', 46, doc.y, { width: ancho });
      doc.moveDown(0.8);
    }

    titulo(doc, 'Averías registradas');
    const av = l.averias || [];
    if (!av.length) parrafo(doc, 'No se han encontrado averías en las centralitas consultadas.');
    for (const a of av) {
      const yy = doc.y;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(a.tipo === 'pendiente' ? '#8a5f00' : a.tipo === 'permanente' ? '#4a5563' : '#c4302a').text(a.codigo, 46, yy, { width: 70 });
      doc.font('Helvetica').fontSize(10.5).fillColor('#232a33').text(a.descripcion, 122, yy, { width: ancho - 200 });
      const yFin = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(TIPO[a.tipo] || a.tipo, 46 + ancho - 70, yy, { width: 70, align: 'right' });
      doc.y = Math.max(yFin, yy + 14) + 6;
    }

    titulo(doc, 'Estado para la ITV (emisiones)');
    const rd = l.readiness || {};
    if (rd.semaforo) {
      const [txt, color] = SEM[rd.semaforo];
      doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(txt, 46, doc.y, { width: ancho });
      parrafo(doc, rd.motivo || '');
    } else parrafo(doc, 'No disponible.');

    if (!cliente && l.freezeFrame?.dtc) {
      titulo(doc, `Freeze frame de ${l.freezeFrame.dtc.codigo}`);
      for (const x of l.freezeFrame.valores) parrafo(doc, `${x.nombre}: ${x.valor} ${x.unidad}`);
    }
    if (iaTexto) {
      titulo(doc, cliente ? 'Valoración del taller' : 'Diagnóstico asistido (IA)');
      parrafo(doc, iaTexto);
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(`${taller} · Arganda del Rey (Madrid) · talleresreyman.com`, 46, doc.page.height - 40, { width: ancho, align: 'center', lineBreak: false });
    doc.end();
  });
}

function titulo(doc, t) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(AZUL).text(t, 46, doc.y);
  doc.moveDown(0.3);
}
function parrafo(doc, t) {
  doc.font('Helvetica').fontSize(10.5).fillColor('#232a33').text(t, 46, doc.y, { width: doc.page.width - 92 });
  doc.moveDown(0.3);
}
