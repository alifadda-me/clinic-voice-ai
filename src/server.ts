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

import { loadEnvFile } from './bin/load-env-file.js';
import { createProductionRuntime } from './runtime/production-runtime.js';
import { loadTraceLoggingConfig } from './config/trace-logging.js';
import { loadGeminiLiveVoiceConfig } from './config/gemini-live.js';
import { attachBrowserVoiceWebSocket } from './interfaces/http/attach-browser-voice-websocket.js';
import { BROWSER_VOICE_WS_PATH } from './interfaces/voice/browser-voice-protocol.js';

loadEnvFile();

async function main(): Promise<void> {
  const runtime = await createProductionRuntime({
    env: process.env,
  });

  const port = runtime.config.port;
  let browserVoiceWs: { close: () => void } | undefined;

  const server = runtime.app.listen(port, () => {
    const trace = loadTraceLoggingConfig();
    if (runtime.voiceStack) {
      browserVoiceWs = attachBrowserVoiceWebSocket(server, {
        voiceClinicSession: runtime.voiceStack.voiceSession,
        observability: runtime.observability,
      });
    }
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
        geminiLiveModel: loadGeminiLiveVoiceConfig(process.env).model,
        browserVoicePath: runtime.voiceStack ? BROWSER_VOICE_WS_PATH : null,
        trace_logging: trace,
      }),
    );
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'shutdown', signal }));
    browserVoiceWs?.close();
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
