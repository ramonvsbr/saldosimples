-- Rode este arquivo UMA VEZ no banco que já está em produção
-- (o schema.sql sozinho não altera tabelas que já existem).
--
-- Exemplo via wrangler:
--   npx wrangler d1 execute <NOME_DO_SEU_BANCO> --remote --file=./migration_add_names.sql

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- Preenche first_name/last_name para usuários que já existiam antes da migração,
-- usando o campo "name" como base (primeira palavra = nome, resto = sobrenome).
UPDATE users
SET first_name = TRIM(SUBSTR(name, 1, CASE WHEN INSTR(name, ' ') = 0 THEN LENGTH(name) ELSE INSTR(name, ' ') - 1 END)),
    last_name  = TRIM(SUBSTR(name, INSTR(name, ' ') + 1))
WHERE first_name IS NULL;
