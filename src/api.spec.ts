import { createHmac } from 'crypto';
import type { BackendClient } from './backend.client';
import { ApiError, codigoPorEstado } from './errores';
import { guiaPdf, totalACobrar } from './guia-pdf';
import { LlaveGuard } from './llave.guard';
import { V1Controller } from './v1.controller';
import { firmar } from './webhooks';

const pedido = {
  numGuia: 'BL-20261016-ABC123',
  tipoPedido: 'Normal',
  fechaEntrega: '2026-10-17',
  pagadoPorRemitente: false,
  valorRecaudado: 89900,
  tarifaEnvio: 12000,
  destinatarioNombre: 'Laura',
  direccion: 'Puente Aranda, Calle 3 # 38b-32',
  usuarioSolicitud: 'Moda Bogotá',
  paquete: 'Ropa',
  pesoKg: 1,
};

describe('webhooks', () => {
  it('firma HMAC-SHA256 del cuerpo con el secreto', () => {
    const cuerpo = JSON.stringify({ evento: 'pedido.entregado' });
    const esperado = createHmac('sha256', 'whsec_x').update(cuerpo).digest('hex');
    expect(firmar('whsec_x', cuerpo)).toBe(`sha256=${esperado}`);
  });
});

describe('errores', () => {
  it('mapea estados del backend a códigos estables', () => {
    expect(codigoPorEstado(404)).toBe('PEDIDO_NO_ENCONTRADO');
    expect(codigoPorEstado(409)).toBe('ESTADO_NO_PERMITE');
    expect(codigoPorEstado(400)).toBe('DATOS_INVALIDOS');
    expect(codigoPorEstado(500)).toBe('ERROR_INTERNO');
  });
});

describe('límite por llave', () => {
  it('responde 429 con Retry-After al pasar el límite del minuto', () => {
    const g = new LlaveGuard({} as BackendClient);
    const t0 = 1_000_000;
    for (let i = 0; i < 120; i++) g.contar('gsx_a', t0);
    try {
      g.contar('gsx_a', t0 + 30_000);
      fail('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(429);
      expect((e as ApiError).cabeceras['Retry-After']).toBe('30');
    }
    expect(() => g.contar('gsx_a', t0 + 61_000)).not.toThrow();
    expect(() => g.contar('gsx_b', t0 + 30_000)).not.toThrow();
  });
});

describe('guía', () => {
  it('cobra el recaudo o nada si el envío está pagado', () => {
    expect(totalACobrar(pedido)).toBe(89900);
    expect(totalACobrar({ ...pedido, pagadoPorRemitente: true })).toBe(0);
    expect(totalACobrar({ ...pedido, valorRecaudado: 0 })).toBe(12000);
  });

  it('genera un PDF', async () => {
    const pdf = await guiaPdf(pedido, 'sticker');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('V1Controller', () => {
  const backend = { pedir: jest.fn(async () => ({ idPedido: 1 })) };
  const c = new V1Controller(backend as unknown as BackendClient);
  const req = { tienda: 7 } as never;
  beforeEach(() => backend.pedir.mockClear());

  it('crear pasa la Idempotency-Key y la tienda', async () => {
    await c.crear(req, { a: 1 }, 'orden-1');
    expect(backend.pedir).toHaveBeenCalledWith('pedidos', {
      metodo: 'POST',
      tienda: 7,
      body: { a: 1 },
      cabeceras: { 'Idempotency-Key': 'orden-1' },
    });
  });

  it('corregir no deja cambiar el estado; cancelar manda el estado 6', async () => {
    await c.corregir(req, 5, { idEstadoPedido: 5, telefonoDestinatario: '300' });
    expect(backend.pedir).toHaveBeenLastCalledWith('pedidos/5', {
      metodo: 'PATCH',
      tienda: 7,
      body: { telefonoDestinatario: '300' },
    });
    await c.cancelar(req, 5);
    expect(backend.pedir).toHaveBeenLastCalledWith('pedidos/5', { metodo: 'PATCH', tienda: 7, body: { idEstadoPedido: 6 } });
  });
});
