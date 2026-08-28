/**
 * Production HTTP server entry — bootstrap only.
 * Validates APP_MODE=production and required env before listen.
 *
 * Usage:
 *   APP_MODE=production DATABASE_URL=... REDIS_URL=... AUTH_*=... \
 *   EMBEDDING_API_KEY=... OPENROUTER_API_KEY=... npx tsx src/server.ts
 *
 * Never uses deterministic embeddings. Missing embedding config fails startup.
 */

import { createProductionRuntime } from './runtime/production-runtime.js';

async function main(): Promise<void> {
  const runtime = await createProductionRuntime({
    env: process.env,
  });

  const port = runtime.config.port;
  const server = runtime.app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'server_listening',
        port,
        identityMode: 'production',
        embeddingModel: runtime.config.embeddings.model,
        embeddingDimensions: runtime.config.embeddings.dimensions,
        enableTwilio: runtime.config.enableTwilio,
        enableVoice: runtime.config.enableVoice,
      }),
    );
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'shutdown', signal }));
    server.close();
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
