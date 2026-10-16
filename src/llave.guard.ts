import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BackendClient } from './backend.client';
import { config } from './config';
import { ApiError } from './errores';

export type PeticionConTienda = Request & { tienda: number };

const CACHE_MS = 60_000;

/**
 * Valida la llave (`Authorization: Bearer gsx_live_…` o `X-Api-Key`) contra el backend, con caché de
 * 60 s, y aplica el límite por minuto de cada llave.
 * shortcut: límite y caché en memoria, pasar a Postgres/Redis si el micro corre en varias réplicas.
 */
@Injectable()
export class LlaveGuard implements CanActivate {
  private readonly cache = new Map<string, { tienda: number; vence: number }>();
  private readonly ventanas = new Map<string, { inicio: number; n: number }>();

  constructor(private readonly backend: BackendClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PeticionConTienda>();
    const auth = req.headers.authorization ?? '';
    const llave = (auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-api-key'] ?? '')).trim();
    if (!llave.startsWith('gsx_')) throw new ApiError(401, 'LLAVE_INVALIDA', 'Falta la llave de API o no es válida.');

    this.contar(llave);
    const ahora = Date.now();
    let item = this.cache.get(llave);
    if (!item || item.vence < ahora) {
      const r = await this.backend
        .pedir<{ idUsuario: number }>('llaves/verificar', { metodo: 'POST', body: { llave } })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 401) {
            throw new ApiError(401, 'LLAVE_INVALIDA', 'La llave de API no es válida o fue revocada.');
          }
          throw e;
        });
      item = { tienda: r.idUsuario, vence: ahora + CACHE_MS };
      this.cache.set(llave, item);
    }
    req.tienda = item.tienda;
    return true;
  }

  /** Ventana fija de un minuto por llave. */
  contar(llave: string, ahora = Date.now()) {
    const v = this.ventanas.get(llave);
    if (!v || ahora - v.inicio >= 60_000) {
      this.ventanas.set(llave, { inicio: ahora, n: 1 });
      return;
    }
    v.n++;
    if (v.n > config.limitePorMinuto) {
      const espera = Math.ceil((v.inicio + 60_000 - ahora) / 1000);
      throw new ApiError(429, 'LIMITE_EXCEDIDO', `Superaste ${config.limitePorMinuto} peticiones por minuto.`, {
        'Retry-After': String(espera),
      });
    }
  }
}
