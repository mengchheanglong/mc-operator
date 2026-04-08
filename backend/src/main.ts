import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const port = Number(process.env.MISSION_CONTROL_BACKEND_PORT || "3201");
  const host = process.env.MISSION_CONTROL_BACKEND_HOST || "127.0.0.1";

  await app.listen(port, host);
  process.stdout.write(
    `mission-control-backend listening on http://${host}:${port}\n`,
  );
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
