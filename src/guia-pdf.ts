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
  /** Nombre comercial si el remitente es tienda; si no, el nombre de la persona. */
  remitenteNombre?: string | null;
  /** Logo de la tienda remitente (enlace firmado). */
  remitenteLogoUrl?: string | null;
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

/**
 * Descarga el logo para incrustarlo (pdfkit solo dibuja PNG y JPG). Si tarda más de 3 s,
 * falla o es otro formato, la guía sale sin logo.
 */
export async function descargarLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    const png = b.subarray(0, 4).toString('hex') === '89504e47';
    const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    return png || jpg ? b : null;
  } catch {
    return null;
  }
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** Guía en PDF (Carta o Sticker 10 × 15 cm) con QR a la consulta pública. */
export async function guiaPdf(p: PedidoGuia, formato: 'carta' | 'sticker'): Promise<Buffer> {
  const sticker = formato === 'sticker';
  const logo = await descargarLogo(p.remitenteLogoUrl);
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
  const remitente = p.remitenteNombre ?? p.usuarioSolicitud ?? '—';
  if (logo) {
    // Logo en una caja fija a la izquierda del nombre, para no mover lo que sigue.
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.image(logo, x, y, { fit: [t(60), t(36)] });
    doc.font('Helvetica').fontSize(t(11)).text(remitente, x + t(66), y + t(12));
    doc.x = x;
    doc.y = Math.max(doc.y, y + t(38));
  } else {
    doc.font('Helvetica').fontSize(t(11)).text(remitente);
  }
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
