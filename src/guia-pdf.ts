import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const SITIO = 'https://www.geoservitexpress.com';

/** Lo que usa la guía del pedido de `GET /pedidos/:id` del backend. */
export type PedidoGuia = {
  numGuia: string;
  tipoPedido?: string | null;
  tipoOperacion?: string | null;
  fechaEntrega: string;
  fragil?: boolean;
  pagadoPorRemitente?: boolean | null;
  valorRecaudado?: number | string | null;
  tarifaEnvio?: number | string | null;
  precio?: number | string | null;
  destinatarioNombre?: string | null;
  destinatarioTelefono?: string | null;
  direccion?: string | null;
  direccionDestino?: string | null;
  destinatarioDestinoNombre?: string | null;
  destinatarioDestinoTelefono?: string | null;
  usuarioSolicitud?: string | null;
  paquete?: string | null;
  pesoKg?: number | string | null;
  observacionesManifiesto?: string | null;
};

/** Lo que cobra el repartidor (misma regla que la guía de la web y la app). */
export function totalACobrar(p: PedidoGuia): number {
  if (p.pagadoPorRemitente) return 0;
  const recaudo = Number(p.valorRecaudado ?? 0);
  return recaudo > 0 ? recaudo : Number(p.tarifaEnvio ?? p.precio ?? 0);
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** Guía en PDF (Carta o Sticker 10 × 15 cm) con QR a la consulta pública. */
export async function guiaPdf(p: PedidoGuia, formato: 'carta' | 'sticker'): Promise<Buffer> {
  const sticker = formato === 'sticker';
  const qr = await QRCode.toBuffer(`${SITIO}/rastrear?guia=${encodeURIComponent(p.numGuia)}`, { margin: 1, width: 320 });
  const doc = new PDFDocument({ size: sticker ? [283, 425] : 'LETTER', margin: sticker ? 14 : 40 });
  const partes: Buffer[] = [];
  doc.on('data', (c: Buffer) => partes.push(c));
  const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(partes))));

  const recogida = p.tipoOperacion === 'RECOLECCION' || p.direccionDestino != null;
  const nombre = (recogida ? p.destinatarioDestinoNombre : p.destinatarioNombre) ?? '—';
  const tel = recogida ? p.destinatarioDestinoTelefono : p.destinatarioTelefono;
  const dir = (recogida ? p.direccionDestino : p.direccion) ?? '—';
  const cobro = totalACobrar(p);
  const t = (n: number) => (sticker ? n * 0.7 : n);

  doc.font('Helvetica-Bold').fontSize(t(20)).text('GEOSERVIT EXPRESS');
  doc.font('Helvetica').fontSize(t(10)).text(`Guía de envío · ${p.tipoPedido ?? ''} · Entrega ${p.fechaEntrega}`);
  doc.moveDown(0.5);
  doc.image(qr, { fit: [t(130), t(130)] });
  doc.font('Courier-Bold').fontSize(t(16)).text(p.numGuia);
  doc.font('Helvetica').fontSize(t(8)).text(`Sigue tu envío: ${SITIO.replace(/^https?:\/\//, '')}/rastrear`);
  if (p.fragil) doc.font('Helvetica-Bold').fontSize(t(11)).text('⚠ FRÁGIL');
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(t(18))
    .text(cobro > 0 ? `COBRAR AL ENTREGAR: ${pesos(cobro)}` : 'ENVÍO PAGADO · NO COBRAR');
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(t(9)).text('DESTINATARIO');
  doc.font('Helvetica').fontSize(t(11)).text(`${nombre}${tel ? ` · Tel. ${tel}` : ''}`).text(dir);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(t(9)).text('REMITENTE');
  doc.font('Helvetica').fontSize(t(11)).text(p.usuarioSolicitud ?? '—');
  if (recogida && p.direccion) doc.text(`Recogida: ${p.direccion}`);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(t(9)).text('PAQUETE');
  doc
    .font('Helvetica')
    .fontSize(t(11))
    .text(`${p.paquete ?? '—'}${Number(p.pesoKg) > 0 ? ` · ${Number(p.pesoKg)} kg` : ''}`);
  if (p.observacionesManifiesto) doc.text(`Contenido: ${p.observacionesManifiesto}`);
  doc.end();
  return fin;
}
