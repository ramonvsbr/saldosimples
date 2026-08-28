var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path === "/api/register" && request.method === "POST") {
        const { name, email, password } = await request.json();
        if (!name || !email || !password) {
          return Response.json({ success: false, error: "Preencha todos os campos." }, { status: 400, headers: corsHeaders });
        }
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existingUser) {
          return Response.json({ success: false, error: "E-mail j\xE1 cadastrado." }, { status: 400, headers: corsHeaders });
        }
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);
        await env.DB.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)").bind(userId, name, email, passwordHash).run();
        const token = await generateToken(userId);
        return Response.json({ success: true, token, name }, { headers: corsHeaders });
      }
      if (path === "/api/login" && request.method === "POST") {
        const { email, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        if (!user || !await verifyPassword(password, user.password_hash)) {
          return Response.json({ success: false, error: "E-mail ou senha incorretos." }, { status: 401, headers: corsHeaders });
        }
        const token = await generateToken(user.id);
        return Response.json({ success: true, token, name: user.name }, { headers: corsHeaders });
      }
      if (path === "/api/sync") {
        const authHeader = request.headers.get("Authorization");
        const userId = await verifyToken(authHeader);
        if (!userId) {
          if (request.method === "GET") {
            return Response.json({ success: false, error: "N\xE3o autorizado. Por favor fa\xE7a login." }, { status: 401, headers: corsHeaders });
          }
          return Response.json({ success: false, error: "N\xE3o autorizado." }, { status: 401, headers: corsHeaders });
        }
        if (request.method === "GET") {
          const row = await env.DB.prepare("SELECT data_json FROM user_data WHERE user_id = ?").bind(userId).first();
          if (row && row.data_json) {
            return new Response(row.data_json, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return Response.json(null, { headers: corsHeaders });
        }
        if (request.method === "POST") {
          const data = await request.json();
          const jsonString = JSON.stringify(data);
          await env.DB.prepare(
            "INSERT INTO user_data (user_id, data_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP"
          ).bind(userId, jsonString).run();
          return Response.json({ success: true }, { headers: corsHeaders });
        }
      }
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }
};
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, storedHash) {
  const [saltHex, originalHash] = storedHash.split(":");
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex === originalHash;
}
__name(verifyPassword, "verifyPassword");
async function generateToken(userId) {
  return btoa(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1e3 }));
}
__name(generateToken, "generateToken");
async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch (e) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
