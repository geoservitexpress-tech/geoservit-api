import { Injectable } from '@nestjs/common';
import { config } from './config';
import { ApiError, codigoPorEstado } from './errores';

type Opciones = {
  metodo?: 'GET' | 'POST' | 'PATCH';
  tienda?: number;
  body?: unknown;
  query?: Record<string, unknown>;
  cabeceras?: Record<string, string>;
};

/** Llama a `/interno/*` de backlogistica con el token de servicio, actuando como `tienda`. */
@Injectable()
export class BackendClient {
  async pedir<T>(ruta: string, o: Opciones = {}): Promise<T> {
    const url = new URL(`${config.backendUrl}/interno/${ruta}`);
    for (const [k, v] of Object.entries(o.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method: o.metodo ?? 'GET',
      headers: {
        Authorization: `Servicio ${config.servicioToken}`,
        'Content-Type': 'application/json',
        ...(o.tienda ? { 'X-Tienda-Id': String(o.tienda) } : {}),
        ...o.cabeceras,
      },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => {
      throw new ApiError(502, 'ERROR_INTERNO', 'El servicio de GeoServit no responde. Intenta de nuevo.');
    });
    if (res.status === 204) return undefined as T;
    const datos = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    if (!res.ok) {
      const m = Array.isArray(datos?.message) ? datos!.message[0] : datos?.message;
      // Un 401 del backend es un problema del token de servicio, no de la llave del cliente.
      const status = res.status === 401 && ruta !== 'llaves/verificar' ? 502 : res.status;
      throw new ApiError(status, codigoPorEstado(res.status), m || 'Error en la solicitud.');
    }
    return datos as T;
  }
}
