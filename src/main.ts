import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port).then(() => {
    console.log(` Server is running on port ${port}`);
  });
}
bootstrap();
