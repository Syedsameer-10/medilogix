import path from 'node:path';
import { MedilogixApiServer } from './electron/server/ApiServer';
import { loadEnvFile } from './electron/server/Env';

loadEnvFile(path.join(__dirname, '..', '.env'));

const server = new MedilogixApiServer();

server.start()
  .then((baseUrl) => {
    console.info(`[MediLogiX] Backend listening at ${baseUrl}`);
  })
  .catch((error: unknown) => {
    console.error('[MediLogiX] Backend failed to start', error);
    process.exit(1);
  });

const shutdown = () => {
  void server.stop().finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
