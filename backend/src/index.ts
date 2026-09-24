import { buildServer } from "./app/server.js";
import { env } from "./app/config/env.js";

async function main() {
  const server = buildServer();

  try {
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    server.log.info(`BCIS Fastify Server running at ${address}`);
    server.log.info(`OpenAPI documentation available at ${address}/docs`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

main();
