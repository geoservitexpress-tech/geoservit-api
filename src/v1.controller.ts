import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BackendClient } from './backend.client';
import { guiaPdf, type PedidoGuia } from './guia-pdf';
import { LlaveGuard, type PeticionConTienda } from './llave.guard';
import { SinIdsInterceptor } from './sin-ids';

const EJEMPLO_PEDIDO = {
  idTipoPedido: 1,
  fechaEntrega: '2026-10-17',
  idMetodoRecepcion: 2,
  nombreDestinatario: 'Laura Gutiérrez',
  telefonoDestinatario: '3152444591',
  tipoViaNombre: 'Calle',
  nombreVia: '3',
  numeroPlaca: '38B',
  numeroSecundario: '32',
  idCiudad: 149,
  idDepartamento: 3,
  idPais: 1,
  idZonaBogota: 16,
  tipoProductoNombre: 'Ropa',
  pesoKg: 1,
  valorDeclarado: 80000,
  fragil: false,
  pagadoPorRemitente: false,
  valorRecaudar: 89900,
  fotosPaqueteUrls: ['https://tutienda.com/fotos/orden-123.jpg'],
};

/** API pública v1: cada llave opera solo los pedidos de su tienda, con las reglas del panel. */
@ApiTags('Pedidos')
@ApiBearerAuth('llave')
@UseGuards(LlaveGuard)
@UseInterceptors(SinIdsInterceptor)
@Controller('v1')
export class V1Controller {
  constructor(private readonly backend: BackendClient) {}

  @Get('cotizar')
  @ApiOperation({ summary: 'Cotizar un envío con la tarifa de tu tienda' })
  @ApiQuery({ name: 'idCiudad', example: 149 })
  @ApiQuery({ name: 'idTipoPedido', example: 1, description: '1 Normal, 2 Express' })
  @ApiQuery({ name: 'pesoKg', example: 1 })
  cotizar(@Req() req: PeticionConTienda, @Query() query: Record<string, string>) {
    return this.backend.pedir('cotizar', { tienda: req.tienda, query });
  }

  @Post('pedidos')
  @ApiOperation({
    summary: 'Crear un pedido',
    description:
      'Mismos campos y reglas que el panel: fecha desde hoy; la foto del paquete es opcional. ' +
      'Envía `Idempotency-Key` (p. ej. el id de tu orden) para que un reintento no cree un duplicado (24 h).',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, example: 'orden-123' })
  @ApiBody({ schema: { example: EJEMPLO_PEDIDO } })
  crear(@Req() req: PeticionConTienda, @Body() body: unknown, @Headers('idempotency-key') clave?: string) {
    return this.backend.pedir('pedidos', {
      metodo: 'POST',
      tienda: req.tienda,
      body,
      cabeceras: clave ? { 'Idempotency-Key': clave } : {},
    });
  }

  @Get('pedidos')
  @ApiOperation({ summary: 'Listar tus pedidos', description: 'Filtros: `idEstado` (1..8, separados por coma), `fechaEntrega`, `busqueda`, `page`, `limit`.' })
  listar(@Req() req: PeticionConTienda, @Query() query: Record<string, string>) {
    return this.backend.pedir('pedidos', { tienda: req.tienda, query });
  }

  @Get('pedidos/:guia')
  @ApiOperation({ summary: 'Consultar un pedido (estado, guía, destinatario, cobro)' })
  @ApiParam({ name: 'guia', example: 'BL-20261016-ABC123' })
  uno(@Req() req: PeticionConTienda, @Param('guia') guia: string) {
    return this.backend.pedir(`pedidos/${encodeURIComponent(guia)}`, { tienda: req.tienda });
  }

  @Get('pedidos/:guia/historial')
  @ApiOperation({ summary: 'Historial de estados del pedido' })
  historial(@Req() req: PeticionConTienda, @Param('guia') guia: string) {
    return this.backend.pedir(`pedidos/${encodeURIComponent(guia)}/historial`, { tienda: req.tienda });
  }

  @Get('pedidos/:guia/guia.pdf')
  @ApiOperation({ summary: 'Guía en PDF para imprimir', description: '`formato`: `carta` (por defecto) o `sticker` (10 × 15 cm).' })
  @ApiQuery({ name: 'formato', required: false, enum: ['carta', 'sticker'] })
  async guia(
    @Req() req: PeticionConTienda,
    @Param('guia') guia: string,
    @Query('formato') formato: string | undefined,
    @Res() res: Response,
  ) {
    const pedido = await this.backend.pedir<PedidoGuia>(`pedidos/${encodeURIComponent(guia)}`, { tienda: req.tienda });
    const pdf = await guiaPdf(pedido, formato === 'sticker' ? 'sticker' : 'carta');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="guia-${pedido.numGuia}.pdf"`);
    res.send(pdf);
  }

  @Patch('pedidos/:guia')
  @ApiOperation({ summary: 'Corregir un pedido', description: 'Solo mientras está en Creado (sin repartidor); mismas reglas que el panel.' })
  corregir(@Req() req: PeticionConTienda, @Param('guia') guia: string, @Body() body: Record<string, unknown>) {
    const { idEstadoPedido: _ignorar, ...datos } = body ?? {};
    return this.backend.pedir(`pedidos/${encodeURIComponent(guia)}`, { metodo: 'PATCH', tienda: req.tienda, body: datos });
  }

  @Post('pedidos/:guia/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar un pedido', description: 'En Creado o Asignado.' })
  cancelar(@Req() req: PeticionConTienda, @Param('guia') guia: string) {
    return this.backend.pedir(`pedidos/${encodeURIComponent(guia)}`, { metodo: 'PATCH', tienda: req.tienda, body: { idEstadoPedido: 6 } });
  }
}
