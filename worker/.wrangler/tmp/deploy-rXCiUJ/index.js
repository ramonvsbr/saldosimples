var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (!env.SESSION_SECRET) {
      return Response.json(
        { success: false, error: "Servidor mal configurado (SESSION_SECRET ausente)." },
        { status: 500, headers: corsHeaders }
      );
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      if (path === "/api/register" && request.method === "POST") {
        const registerAttempts = await countRecentAttempts(env, ip, "register", 60);
        if (registerAttempts >= 8) {
          return Response.json(
            { success: false, error: "Muitas tentativas de cadastro. Tente novamente mais tarde." },
            { status: 429, headers: corsHeaders }
          );
        }
        await recordAttempt(env, ip, "register", true);
        const { name, firstName, lastName, email, password } = await request.json();
        if (!email || !password || !(name || firstName)) {
          return Response.json({ success: false, error: "Preencha todos os campos." }, { status: 400, headers: corsHeaders });
        }
        if (password.length < 8) {
          return Response.json({ success: false, error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400, headers: corsHeaders });
        }
        const safeName = name || "";
        const finalFirstName = (firstName || safeName.split(" ")[0] || "").trim();
        const finalLastName = (lastName || safeName.split(" ").slice(1).join(" ") || "").trim();
        const finalName = (safeName || `${finalFirstName} ${finalLastName}`).trim();
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(normalizedEmail).first();
        if (existingUser) {
          return Response.json({ success: false, error: "E-mail j\xE1 cadastrado." }, { status: 400, headers: corsHeaders });
        }
        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(password);
        await env.DB.prepare("INSERT INTO users (id, name, first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, finalName, finalFirstName, finalLastName, normalizedEmail, passwordHash).run();
        const token = await generateToken(userId, env.SESSION_SECRET);
        return Response.json({ success: true, token, name: finalName, firstName: finalFirstName }, { headers: corsHeaders });
      }
      if (path === "/api/login" && request.method === "POST") {
        const { email, password } = await request.json();
        const normalizedEmail = (email || "").trim().toLowerCase();
        const failedByEmail = await countRecentAttempts(env, normalizedEmail, "login", 15, true);
        const failedByIp = await countRecentAttempts(env, ip, "login", 15, true);
        if (failedByEmail >= 5 || failedByIp >= 20) {
          return Response.json(
            { success: false, error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
            { status: 429, headers: corsHeaders }
          );
        }
        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(normalizedEmail).first();
        if (!user || !await verifyPassword(password, user.password_hash)) {
          await recordAttempt(env, normalizedEmail, "login", false);
          await recordAttempt(env, ip, "login", false);
          return Response.json({ success: false, error: "E-mail ou senha incorretos." }, { status: 401, headers: corsHeaders });
        }
        const firstName = user.first_name || (user.name || "").split(" ")[0] || "";
        const token = await generateToken(user.id, env.SESSION_SECRET);
        return Response.json({ success: true, token, name: user.name, firstName }, { headers: corsHeaders });
      }
      if (path === "/api/sync") {
        const authHeader = request.headers.get("Authorization");
        const userId = await verifyToken(authHeader, env.SESSION_SECRET);
        if (!userId) {
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
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return new Response("P\xE1gina n\xE3o encontrada", { status: 404, headers: corsHeaders });
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
async function getSigningKey(secret) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(getSigningKey, "getSigningKey");
function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
__name(bufferToBase64, "bufferToBase64");
function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
__name(base64ToBuffer, "base64ToBuffer");
async function generateToken(userId, secret) {
  const payload = JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1e3 });
  const payloadB64 = btoa(payload);
  const key = await getSigningKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const signatureB64 = bufferToBase64(signature);
  return `${payloadB64}.${signatureB64}`;
}
__name(generateToken, "generateToken");
async function verifyToken(token, secret) {
  if (!token) return null;
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;
    const key = await getSigningKey(secret);
    const encoder = new TextEncoder();
    const signatureBytes = base64ToBuffer(signatureB64);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.userId;
  } catch (e) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
async function recordAttempt(env, identifier, type, success) {
  await env.DB.prepare("INSERT INTO auth_attempts (identifier, type, success) VALUES (?, ?, ?)").bind(identifier, type, success ? 1 : 0).run();
}
__name(recordAttempt, "recordAttempt");
async function countRecentAttempts(env, identifier, type, windowMinutes, onlyFailed = false) {
  const failedFilter = onlyFailed ? "AND success = 0" : "";
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM auth_attempts
     WHERE identifier = ? AND type = ? AND created_at > datetime('now', ?) ${failedFilter}`
  ).bind(identifier, type, `-${windowMinutes} minutes`).first();
  return row ? row.count : 0;
}
__name(countRecentAttempts, "countRecentAttempts");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
