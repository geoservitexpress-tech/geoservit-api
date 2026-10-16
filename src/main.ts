import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { config } from './config';
import { FiltroErrores } from './errores';

async function bootstrap() {
  if (!config.servicioToken) throw new Error('Falta SERVICIO_TOKEN (el mismo de backlogistica).');
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new FiltroErrores());
  app.enableShutdownHooks();
  const doc = new DocumentBuilder()
    .setTitle('GeoServit Express — API para tiendas')
    .setDescription(
      'Crea, consulta y gestiona tus pedidos desde tu sistema. Autenticación: `Authorization: Bearer <tu llave>` ' +
        '(la entrega GeoServit). Errores: `{ codigo, mensaje }` con códigos LLAVE_INVALIDA, PEDIDO_NO_ENCONTRADO, ' +
        'DATOS_INVALIDOS, ESTADO_NO_PERMITE, LIMITE_EXCEDIDO, ERROR_INTERNO. Webhooks: POST a tu URL con ' +
        '`X-GeoServit-Evento` y `X-GeoServit-Firma: sha256=HMAC(secreto, cuerpo)`.',
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'llave')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  await app.listen(config.puerto, '0.0.0.0');
}
void bootstrap();
