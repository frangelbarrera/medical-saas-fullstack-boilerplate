/**
 * Backwards-compatible entrypoint shim.
 *
 * The actual server implementation lives in src/server/. This file exists so
 * that `npm run dev` (which calls `tsx server.ts`) and existing Docker
 * configs keep working without changes.
 *
 * Uses dynamic import() so that START_SERVER=1 is set BEFORE src/server/index.ts
 * is evaluated (ESM static imports are hoisted and run before any code).
 */
process.env.START_SERVER = "1";
import("./src/server/index.js");
