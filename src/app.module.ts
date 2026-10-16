import { Controller, Get, Module } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BackendClient } from './backend.client';
import { LlaveGuard } from './llave.guard';
import { V1Controller } from './v1.controller';
import { RepartidorWebhooks } from './webhooks';

@ApiExcludeController()
@Controller()
class SaludController {
  @Get('salud')
  salud() {
    return { ok: true };
  }
}

@Module({
  controllers: [V1Controller, SaludController],
  providers: [BackendClient, LlaveGuard, RepartidorWebhooks],
})
export class AppModule {}
