import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Spawns the server as a child process with test env vars and returns a fetch
 * client pointing at it.
 *
 * The server is now refactored to export createApp() (see src/server/app.ts).
 * For supertest-style in-process testing, import { createApp } directly from
 * src/server/app.ts. This spawn helper is kept for end-to-end tests that need
 * a real HTTP listener.
 */
export async function startTestServer(port = 3999): Promise<{
  baseUrl: string;
  stop: () => Promise<void>;
  process: ChildProcess;
}> {
  // server.ts is now a shim that imports src/server/index.ts
  const serverPath = path.join(__dirname, "..", "..", "server.ts");

  const child = spawn("npx", ["tsx", serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      START_SERVER: "1", // signal src/server/index.ts to actually listen
      PORT: String(port),
      PGHOST: "localhost",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: "postgres",
      PGDATABASE: "medical_saas_test",
      JWT_SECRET: "test_jwt_secret_minimum_32_characters_long_for_testing_only",
      ENCRYPTION_KEY: "a".repeat(64),
      PAYMENT_WEBHOOK_SECRET: "test_webhook_secret_min_16_chars",
      FRONTEND_URL: "http://localhost:3000",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Log child output for debugging (disabled by default; enable with DEBUG=1)
  const debug = !!process.env.DEBUG;
  child.stdout?.on("data", (data: Buffer) => {
    if (debug) process.stdout.write(`[server:stdout] ${data.toString()}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    if (debug) process.stderr.write(`[server:stderr] ${data.toString()}`);
  });

  // Wait for the server to start listening
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Server failed to start within 30s"));
    }, 30000);

    const onData = (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Server running")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code} before responding`));
    });
  });

  return {
    baseUrl: `http://localhost:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        child.kill("SIGTERM");
        child.on("exit", () => resolve());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 5000);
      }),
    process: child,
  };
}

/**
 * Login helper: returns the auth cookie and CSRF token.
 */
export async function login(
  baseUrl: string,
  username: string,
  password: string,
  role?: string
): Promise<{ cookies: string; csrfToken: string; user: any }> {
  const body: any = { username, password };
  if (role) body.role = role;

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "login failed" }));
    throw new Error(`Login failed: ${err.error}`);
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const cookies = setCookie
    .split(",")
    .map((c) => c.split(";")[0])
    .join("; ");
  const data = (await res.json()) as any;
  return { cookies, csrfToken: data.csrfToken, user: data.user };
}

/**
 * Authenticated fetch with CSRF token.
 */
export async function authedFetch(
  baseUrl: string,
  path: string,
  opts: {
    cookies: string;
    csrfToken: string;
    method?: string;
    body?: any;
  }
): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: opts.cookies,
    "x-csrf-token": opts.csrfToken,
  };
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${baseUrl}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}
