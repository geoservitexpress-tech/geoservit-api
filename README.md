# geoservit-api — API de GeoServit Express para tiendas

Servicio público que deja a las tiendas crear y gestionar sus pedidos desde su sistema. No tiene base
de datos: llama a `backlogistica` (`/interno/*`) con un token de servicio, actuando como la tienda dueña
de la llave. Las reglas (tarifa propia, foto obligatoria, estados) viven en el backend.

Documentación interactiva: `https://api.geoservitexpress.com/docs`.

## Variables (Railway)

| Variable | Valor |
|---|---|
| `BACKEND_URL` | URL de backlogistica (red privada de Railway, p. ej. `http://backlogistica.railway.internal:8080`) |
| `SERVICIO_TOKEN` | Secreto largo, **el mismo** en backlogistica |
| `LIMITE_POR_MINUTO` | Opcional, 120 por defecto |
| `WEBHOOKS_ACTIVOS` | Opcional, `false` para no enviar webhooks |

## Para la tienda

La llave la genera GeoServit (panel → Tiendas → la tienda → Integración). Se envía en cada petición:

```bash
curl https://api.geoservitexpress.com/v1/pedidos -H "Authorization: Bearer gsx_live_…"
```

Cotizar:

```bash
curl "https://api.geoservitexpress.com/v1/cotizar?idCiudad=149&idTipoPedido=1&pesoKg=1" -H "Authorization: Bearer $LLAVE"
```

Crear un pedido (usa el id de tu orden como `Idempotency-Key` para no duplicar en un reintento):

```bash
curl -X POST https://api.geoservitexpress.com/v1/pedidos \
  -H "Authorization: Bearer $LLAVE" -H "Content-Type: application/json" -H "Idempotency-Key: orden-123" \
  -d '{"idTipoPedido":1,"fechaEntrega":"2026-10-17","idMetodoRecepcion":2,
       "nombreDestinatario":"Laura Gutiérrez","telefonoDestinatario":"3152444591",
       "tipoViaNombre":"Calle","nombreVia":"3","numeroPlaca":"38B","numeroSecundario":"32",
       "idCiudad":149,"idDepartamento":3,"idPais":1,"idZonaBogota":16,
       "tipoProductoNombre":"Ropa","pesoKg":1,"valorDeclarado":80000,
       "pagadoPorRemitente":false,"valorRecaudar":89900,
       "fotosPaqueteUrls":["https://tutienda.com/fotos/orden-123.jpg"]}'
```

Otros: `GET /v1/pedidos/{id}`, `GET /v1/pedidos/{id}/historial`, `GET /v1/pedidos/{id}/guia.pdf?formato=sticker`,
`PATCH /v1/pedidos/{id}` (solo en Creado), `POST /v1/pedidos/{id}/cancelar` (Creado o Asignado).

Errores: `{ "codigo": "...", "mensaje": "..." }` — `LLAVE_INVALIDA` (401), `PEDIDO_NO_ENCONTRADO` (404),
`DATOS_INVALIDOS` (400), `ESTADO_NO_PERMITE` (409), `LIMITE_EXCEDIDO` (429, con `Retry-After`), `ERROR_INTERNO`.

### Webhooks

GeoServit hace `POST` a tu URL con `X-GeoServit-Evento` (`pedido.asignado`, `pedido.recibido`,
`pedido.en_curso`, `pedido.entregado`, `pedido.no_entregado`, `pedido.cancelado`, `webhook.prueba`) y
`X-GeoServit-Firma: sha256=<HMAC-SHA256 del cuerpo con tu secreto>`. Responde 2xx; si no, se reintenta
hasta 8 veces en 24 h. Verificación en Node:

```js
const firma = 'sha256=' + crypto.createHmac('sha256', SECRETO).update(cuerpoCrudo).digest('hex');
const valida = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(req.headers['x-geoservit-firma']));
```

## Desarrollo

```bash
npm install
SERVICIO_TOKEN=… BACKEND_URL=http://localhost:3001 npm run start:dev
npm test
```
