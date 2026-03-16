import { appPort, defaultScanOptions, scannerContext } from "../config.js";
import { pool, withTransaction } from "../db.js";
import { createServer } from "./create-server.js";
import { PgRepository } from "./repositories/pg.js";
import { BackendService } from "./service.js";

const repository = new PgRepository({ pool, withTransaction });
const service = new BackendService({
  repository,
  scanOptionsDefaults: defaultScanOptions,
  scannerContext
});

const server = createServer({
  service,
  healthcheck: async () => {
    await pool.query("SELECT 1");
  }
});

server.listen(appPort, () => {
  console.log(`API listening on http://0.0.0.0:${appPort}`);
});
