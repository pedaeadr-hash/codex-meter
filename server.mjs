import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeUsage } from "./usage.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const KEY_FILE = join(ROOT, ".codex-meter-key");
const PORT = Number(process.env.PORT || 4177);
const HOST = process.env.HOST || "0.0.0.0";

function accessKey() {
  if (process.env.CODEX_METER_KEY) return process.env.CODEX_METER_KEY;
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, "utf8").trim();
  const key = randomBytes(18).toString("base64url");
  writeFileSync(KEY_FILE, `${key}\n`, { encoding: "utf8", mode: 0o600 });
  return key;
}

const ACCESS_KEY = accessKey();

class CodexRpc {
  constructor() {
    this.process = null;
    this.pending = new Map();
    this.requestId = 0;
    this.ready = null;
    this.stderr = "";
  }

  start() {
    if (this.ready) return this.ready;

    this.ready = new Promise((resolve, reject) => {
      const binary = process.env.CODEX_BINARY || (process.platform === "win32" ? "codex.exe" : "codex");
      const userHome = process.env.USERPROFILE || process.env.HOME;
      const child = spawn(binary, ["app-server"], {
        cwd: ROOT,
        env: {
          ...process.env,
          HOME: process.env.HOME || userHome,
          CODEX_HOME: process.env.CODEX_HOME || (userHome ? join(userHome, ".codex") : undefined),
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.process = child;

      child.stderr.on("data", (chunk) => {
        this.stderr = `${this.stderr}${chunk}`.slice(-1200);
      });

      child.once("error", (error) => {
        this.reset(error);
        reject(error);
      });

      child.once("exit", (code) => {
        const error = new Error(`Codex App Server encerrou com código ${code ?? "desconhecido"}. ${this.stderr}`.trim());
        this.reset(error);
      });

      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }

        if (message.id == null) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || "Falha no Codex App Server"));
        else pending.resolve(message.result);
      });

      this.rawRequest("initialize", {
        clientInfo: {
          name: "codex_meter_local",
          title: "Codex Meter",
          version: "1.0.0",
        },
      }, 12000)
        .then(() => {
          this.send({ method: "initialized", params: {} });
          resolve();
        })
        .catch((error) => {
          this.reset(error);
          reject(error);
        });
    });

    return this.ready;
  }

  send(message) {
    if (!this.process?.stdin?.writable) throw new Error("Codex App Server indisponível");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  rawRequest(method, params = {}, timeoutMs = 10000) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo esgotado ao consultar ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ method, id, params });
    });
  }

  async request(method, params = {}) {
    await this.start();
    return this.rawRequest(method, params);
  }

  reset(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.process = null;
    this.ready = null;
  }

  stop() {
    this.process?.kill();
  }
}

const rpc = new CodexRpc();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function authorized(request, url) {
  const headerKey = request.headers["x-access-key"];
  return headerKey === ACCESS_KEY || url.searchParams.get("key") === ACCESS_KEY;
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    json(response, 404, { error: "Não encontrado" });
    return;
  }
  const type = mimeTypes[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ["/index.html", "/styles.css", "/app.js", "/sw.js", "/manifest.webmanifest"].includes(requested)
      ? "no-cache"
      : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(readFileSync(filePath));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/usage") {
    if (!authorized(request, url)) {
      json(response, 401, { error: "Chave de acesso inválida" });
      return;
    }
    try {
      const [limits, usage] = await Promise.all([
        rpc.request("account/rateLimits/read"),
        rpc.request("account/usage/read"),
      ]);
      json(response, 200, normalizeUsage(limits, usage));
    } catch (error) {
      json(response, 503, {
        error: "Não foi possível consultar o Codex agora.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  serveStatic(response, decodeURIComponent(url.pathname));
});

function localAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

server.listen(PORT, HOST, () => {
  console.log("\nCodex Meter está ativo.");
  console.log(`PC:     http://localhost:${PORT}/?key=${ACCESS_KEY}`);
  for (const address of localAddresses()) {
    console.log(`iPhone: http://${address}:${PORT}/?key=${ACCESS_KEY}`);
  }
  console.log("\nMantenha esta janela aberta enquanto usar o app no iPhone.\n");
});

process.on("SIGINT", () => {
  rpc.stop();
  server.close(() => process.exit(0));
});
