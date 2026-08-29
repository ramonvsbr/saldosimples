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
      console.error("SESSION_SECRET ausente na configura\xE7\xE3o do worker.");
      return Response.json(
        { success: false, error: "Servidor mal configurado." },
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
        try {
          await env.DB.prepare("INSERT INTO users (id, name, first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, finalName, finalFirstName, finalLastName, normalizedEmail, passwordHash).run();
        } catch (insertErr) {
          if (String(insertErr.message).toUpperCase().includes("UNIQUE")) {
            return Response.json({ success: false, error: "E-mail j\xE1 cadastrado." }, { status: 400, headers: corsHeaders });
          }
          throw insertErr;
        }
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
        return Response.json(
          { success: false, error: "M\xE9todo n\xE3o permitido." },
          { status: 405, headers: { ...corsHeaders, Allow: "GET, POST, OPTIONS" } }
        );
      }
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return new Response("P\xE1gina n\xE3o encontrada", { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error("Erro n\xE3o tratado:", err);
      return Response.json({ success: false, error: "Erro interno do servidor." }, { status: 500, headers: corsHeaders });
    }
  },
  // Limpeza periódica da tabela de rate-limit (configurar em wrangler.toml -> [triggers] crons)
  async scheduled(event, env, ctx) {
    try {
      await env.DB.prepare("DELETE FROM auth_attempts WHERE created_at < datetime('now', '-7 days')").run();
    } catch (e) {
      console.error("Erro ao limpar auth_attempts:", e);
    }
  }
};
async function deriveHashHex(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(deriveHashHex, "deriveHashHex");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveHashHex(password, salt);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
__name(timingSafeEqualHex, "timingSafeEqualHex");
async function verifyPassword(password, storedHash) {
  const [saltHex, originalHash] = storedHash.split(":");
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  const hashHex = await deriveHashHex(password, salt);
  return timingSafeEqualHex(hashHex, originalHash);
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
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
__name(arrayBufferToBase64, "arrayBufferToBase64");
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
__name(base64ToArrayBuffer, "base64ToArrayBuffer");
async function generateToken(userId, secret) {
  const payload = JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1e3 });
  const payloadB64 = btoa(payload);
  const key = await getSigningKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const signatureB64 = arrayBufferToBase64(signature);
  return `${payloadB64}.${signatureB64}`;
}
__name(generateToken, "generateToken");
async function verifyToken(tokenHeader, secret) {
  if (!tokenHeader) return null;
  try {
    const token = tokenHeader.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signatureB64] = parts;
    const key = await getSigningKey(secret);
    const encoder = new TextEncoder();
    const signatureBuffer = base64ToArrayBuffer(signatureB64);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBuffer, encoder.encode(payloadB64));
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
  try {
    await env.DB.prepare("INSERT INTO auth_attempts (identifier, type, success) VALUES (?, ?, ?)").bind(identifier, type, success ? 1 : 0).run();
  } catch (e) {
    console.error("Erro ao registrar tentativa:", e);
  }
}
__name(recordAttempt, "recordAttempt");
async function countRecentAttempts(env, identifier, type, windowMinutes, onlyFailed = false) {
  try {
    const failedFilter = onlyFailed ? "AND success = 0" : "";
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM auth_attempts
       WHERE identifier = ? AND type = ? AND created_at > datetime('now', ?) ${failedFilter}`
    ).bind(identifier, type, `-${windowMinutes} minutes`).first();
    return row ? row.count : 0;
  } catch (e) {
    console.error("Erro ao contar tentativas:", e);
    return 0;
  }
}
__name(countRecentAttempts, "countRecentAttempts");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
