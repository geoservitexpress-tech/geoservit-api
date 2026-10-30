import { createHmac } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { BackendClient } from './backend.client';
import { config } from './config';
import { sinIdsInternos } from './sin-ids';

type Evento = { idWebhookEvento: number; evento: string; payload: unknown; url: string; secreto: string };

/** Firma `sha256=<hex>` del cuerpo con el secreto de la tienda (cabecera `X-GeoServit-Firma`). */
export const firmar = (secreto: string, cuerpo: string) =>
  `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

/** Cada 15 s toma los avisos pendientes del backend, los envía firmados e informa el resultado. */
@Injectable()
export class RepartidorWebhooks implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RepartidorWebhooks.name);
  private timer?: NodeJS.Timeout;
  private ocupado = false;

  constructor(private readonly backend: BackendClient) {}

  onApplicationBootstrap() {
    if (!config.webhooksActivos) return;
    this.timer = setInterval(() => void this.ciclo(), 15_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async ciclo(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      const eventos = await this.backend.pedir<Evento[]>('webhooks/pendientes', { query: { limite: 50 } });
      await Promise.all(eventos.map((e) => this.enviar(e)));
    } catch (e) {
      this.logger.warn(`No se pudieron leer los webhooks pendientes: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.ocupado = false;
    }
  }

  async enviar(e: Evento): Promise<void> {
    const cuerpo = JSON.stringify(sinIdsInternos(e.payload));
    let ok = false;
    let error: string | undefined;
    try {
      const r = await fetch(e.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GeoServit-Webhooks/1',
          'X-GeoServit-Evento': e.evento,
          // Estable entre reintentos, para detectar duplicados, sin revelar el consecutivo.
          'X-GeoServit-Id': firmar(e.secreto, String(e.idWebhookEvento)).slice(7, 39),
          'X-GeoServit-Firma': firmar(e.secreto, cuerpo),
        },
        body: cuerpo,
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      });
      ok = r.status >= 200 && r.status < 300;
      if (!ok) error = `HTTP ${r.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await this.backend
      .pedir(`webhooks/${e.idWebhookEvento}/resultado`, { metodo: 'POST', body: { ok, error } })
      .catch(() => undefined);
  }
}
