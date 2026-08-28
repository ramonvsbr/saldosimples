-- Tabela de Usuários
-- OBS: como esta tabela já existe no banco em produção, rodar "CREATE TABLE IF NOT EXISTS"
-- não adiciona as novas colunas em bancos já criados. Rode a migração abaixo uma única vez
-- (veja migration_add_names.sql) para adicionar first_name/last_name ao banco existente.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Dados Financeiros
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);