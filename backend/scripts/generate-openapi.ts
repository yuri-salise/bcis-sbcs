import fs from "node:fs";
import path from "node:path";
import { buildServer } from "../src/app/server.js";

async function generateOpenApi() {
  const server = buildServer();
  await server.ready();

  const swaggerObject = server.swagger();
  const docsDir = path.resolve(process.cwd(), "docs");

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const outputPath = path.join(docsDir, "openapi.json");
  fs.writeFileSync(outputPath, JSON.stringify(swaggerObject, null, 2), "utf8");

  console.log(`Canonical OpenAPI contract exported to: ${outputPath}`);
  process.exit(0);
}

generateOpenApi().catch((err) => {
  console.error("Failed to generate OpenAPI specification:", err);
  process.exit(1);
});
