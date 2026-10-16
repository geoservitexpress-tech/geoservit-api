/** Variables de entorno del micro (Railway). */
export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  /** URL interna de backlogistica (red privada de Railway), sin barra final. */
  backendUrl: (process.env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, ''),
  /** Mismo valor que `SERVICIO_TOKEN` en backlogistica. */
  servicioToken: process.env.SERVICIO_TOKEN ?? '',
  /** Peticiones por minuto por llave. */
  limitePorMinuto: Number(process.env.LIMITE_POR_MINUTO ?? 120),
  /** Desactiva el repartidor de webhooks (pruebas locales). */
  webhooksActivos: process.env.WEBHOOKS_ACTIVOS !== 'false',
};
