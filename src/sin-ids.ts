import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';

/** Ids de catálogo: la tienda los necesita para crear pedidos; los demás `idXxx` son internos. */
const CATALOGOS = new Set([
  'idEstadoPedido',
  'idTipoPedido',
  'idMetodoRecepcion',
  'idZonaBogota',
  'idCiudad',
  'idCiudadEntrega',
  'idDepartamento',
  'idPais',
]);

/** Copia sin ids internos, a cualquier profundidad. */
export function sinIdsInternos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinIdsInternos);
  if (valor === null || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([k]) => !/^id[A-Z]/.test(k) || CATALOGOS.has(k))
      .map(([k, v]) => [k, sinIdsInternos(v)]),
  );
}

@Injectable()
export class SinIdsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(sinIdsInternos));
  }
}
