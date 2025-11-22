export interface Env {
  LINKS_KV: KVNamespace;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const DATA_KEY = "links_data_v1";
const CONFIG_KEY = "app_config_v1";
const AUTH_COOKIE = "LM_AUTH";

// 默认密码 —— 你可以改成你喜欢的，README 里也写上
const DEFAULT_PASSWORD = "linkmanager";

// ---------------- 工具函数 ----------------

type AppConfig = {
  passwordHash?: string;
};

const json = (data: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
};

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  const parts = cookie.split(/; */);
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === name && v) return decodeURIComponent(v);
  }
  return null;
}

// 简单 SHA-256 哈希 —— 个人小项目够用
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getConfig(env: Env): Promise<AppConfig> {
  const raw = await env.LINKS_KV.get(CONFIG_KEY, "json");
  return (raw as AppConfig) || {};
}

async function saveConfig(env: Env, config: AppConfig) {
  await env.LINKS_KV.put(CONFIG_KEY, JSON.stringify(config));
}

// 当前生效的密码 hash：
// 如果 KV 里还没设置，就使用默认密码的 hash
async function getCurrentPasswordHash(env: Env): Promise<string> {
  const cfg = await getConfig(env);
  if (cfg.passwordHash) return cfg.passwordHash;
  return await hashPassword(DEFAULT_PASSWORD);
}

async function isAuthenticated(req: Request, env: Env): Promise<boolean> {
  const token = getCookie(req, AUTH_COOKIE);
  if (!token) return false;
  const currentHash = await getCurrentPasswordHash(env);
  return token === currentHash;
}

function setAuthCookie(hash: string): string {
  // 用密码的 hash 作为 cookie 的值（只用来等值比较，不回传明文）
  // 30 天有效
  const maxAge = 60 * 60 * 24 * 30;
  return `${AUTH_COOKIE}=${encodeURIComponent(
    hash
  )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ---------------- 主处理逻辑 ----------------

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    // 1. 登录状态查询
    if (pathname === "/api/auth-status" && req.method === "GET") {
      const ok = await isAuthenticated(req, env);
      return json({ authenticated: ok });
    }

    // 2. 登录接口
    if (pathname === "/api/login" && req.method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
      }

      const password = (body?.password || "").toString();
      if (!password) {
        return json({ error: "Password required" }, { status: 400 });
      }

      const currentHash = await getCurrentPasswordHash(env);
      const inputHash = await hashPassword(password);

      if (inputHash !== currentHash) {
        return json({ error: "Wrong password" }, { status: 401 });
      }

      const headers = new Headers();
      headers.append("Set-Cookie", setAuthCookie(currentHash));
      return json({ ok: true }, { status: 200, headers });
    }

    // 3. 修改密码（需要已登录）
    if (pathname === "/api/change-password" && req.method === "POST") {
      if (!(await isAuthenticated(req, env))) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
      }

      const oldPassword = (body?.oldPassword || "").toString();
      const newPassword = (body?.newPassword || "").toString();

      if (!oldPassword || !newPassword) {
        return json(
          { error: "oldPassword and newPassword are required" },
          { status: 400 }
        );
      }

      const currentHash = await getCurrentPasswordHash(env);
      const oldHash = await hashPassword(oldPassword);
      if (oldHash !== currentHash) {
        return json({ error: "Old password incorrect" }, { status: 400 });
      }

      const newHash = await hashPassword(newPassword);
      const cfg = await getConfig(env);
      cfg.passwordHash = newHash;
      await saveConfig(env, cfg);

      const headers = new Headers();
      headers.append("Set-Cookie", setAuthCookie(newHash));

      return json({ ok: true }, { status: 200, headers });
    }

    // 4. 保护 /api/data：没登录不让访问
    if (pathname === "/api/data") {
      const authed = await isAuthenticated(req, env);
      if (!authed) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      if (req.method === "GET") {
        const data = await env.LINKS_KV.get(DATA_KEY, "json");
        return json(
          data || {
            categories: [],
            links: [],
          }
        );
      }

      if (req.method === "POST") {
        const body = await req.json();
        await env.LINKS_KV.put(DATA_KEY, JSON.stringify(body));
        return json({ ok: true });
      }

      return json({ error: "Method not allowed" }, { status: 405 });
    }

    // 5. 其它路径：交给静态资源（前端）
    return env.ASSETS.fetch(req);
  },
};
