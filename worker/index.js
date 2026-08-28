export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // 1. REGISTRO DE USUÁRIO
      if (path === '/api/register' && request.method === 'POST') {
        const { name, email, password } = await request.json();
        const userId = crypto.randomUUID();
        const passHash = await hashPassword(password);

        await env.DB.prepare(
          'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
        ).bind(userId, name, email, passHash).run();

        return new Response(JSON.stringify({ success: true, token: userId, name }), { headers });
      }

      // 2. LOGIN DE USUÁRIO
      if (path === '/api/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const passHash = await hashPassword(password);

        const user = await env.DB.prepare(
          'SELECT id, name FROM users WHERE email = ? AND password_hash = ?'
        ).bind(email, passHash).first();

        if (!user) {
          return new Response(JSON.stringify({ error: 'Credenciais inválidas.' }), { status: 401, headers });
        }

        return new Response(JSON.stringify({ success: true, token: user.id, name: user.name }), { headers });
      }

      // 3. OBTER DADOS DO USUÁRIO
      if (path === '/api/sync' && request.method === 'GET') {
        const userId = request.headers.get('Authorization');
        if (!userId) return new Response('Não autorizado', { status: 401 });

        const row = await env.DB.prepare(
          'SELECT data_json FROM user_data WHERE user_id = ?'
        ).bind(userId).first();

        return new Response(row ? row.data_json : JSON.stringify(null), { headers });
      }

      // 4. SALVAR / SINCRONIZAR DADOS
      if (path === '/api/sync' && request.method === 'POST') {
        const userId = request.headers.get('Authorization');
        if (!userId) return new Response('Não autorizado', { status: 401 });

        const body = await request.text();
        await env.DB.prepare(`
          INSERT INTO user_data (user_id, data_json, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET 
            data_json = excluded.data_json,
            updated_at = CURRENT_TIMESTAMP
        `).bind(userId, body).run();

        return new Response(JSON.stringify({ success: true }), { headers });
      }

      // SERVIMENTO DE ARQUIVOS ESTÁTICOS (HTML, CSS, JS)
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }
};

async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}