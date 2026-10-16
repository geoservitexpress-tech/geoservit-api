import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Códigos estables que ven los integradores. */
export type CodigoError =
  | 'LLAVE_INVALIDA'
  | 'PEDIDO_NO_ENCONTRADO'
  | 'DATOS_INVALIDOS'
  | 'ESTADO_NO_PERMITE'
  | 'LIMITE_EXCEDIDO'
  | 'ERROR_INTERNO';

/** Error de la API pública: `{ codigo, mensaje }` con su estado HTTP. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoError,
    mensaje: string,
    readonly cabeceras: Record<string, string> = {},
  ) {
    super(mensaje);
  }
}

/** Traduce el estado HTTP del backend al código público. */
export function codigoPorEstado(status: number): CodigoError {
  if (status === 401 || status === 403) return 'LLAVE_INVALIDA';
  if (status === 404) return 'PEDIDO_NO_ENCONTRADO';
  if (status === 400 || status === 422) return 'DATOS_INVALIDOS';
  if (status === 409) return 'ESTADO_NO_PERMITE';
  if (status === 429) return 'LIMITE_EXCEDIDO';
  return 'ERROR_INTERNO';
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ApiError) {
      for (const [k, v] of Object.entries(error.cabeceras)) res.setHeader(k, v);
      return res.status(error.status).json({ codigo: error.codigo, mensaje: error.message });
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return res.status(status).json({ codigo: codigoPorEstado(status), mensaje: error.message });
    }
    this.logger.error(error instanceof Error ? error.stack : String(error));
    return res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno. Intenta de nuevo.' });
  }
}
