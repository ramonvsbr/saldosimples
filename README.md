# Saldo Simples 💰

O **Saldo Simples** é um web app (PWA) leve, minimalista e responsivo para controle financeiro pessoal. Ele permite acompanhar receitas e despesas mês a mês e visualizar o acumulado anual, com suporte total a funcionamento offline e sincronização em nuvem.

![Status do Projeto](https://img.shields.io/badge/status-ativo-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

---

## 🚀 Funcionalidades

- **Controle Mensal e Anual:** Visualização de saldos, totais de despesas e receitas organizados mês a mês ou por resumo geral.
- **PWA (Progressive Web App):** Instalável no celular ou desktop, com suporte offline via Service Worker (*Stale-While-Revalidate*).
- **Tema Dinâmico (Dark/Light Mode):** Alternância manual ou automática via CSS variables, sincronizada com a barra do navegador.
- **Autenticação e Nuvem:** Login e cadastro com tokens JWT e hashing seguro (PBKDF2/SHA-256).
- **Sincronização com Fallback Local:** Os dados continuam salvos no navegador (`localStorage`) e são sincronizados no Cloudflare D1 quando online.
- **Backup Local:** Opção de exportar e importar dados em formato `.json`.

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **HTML5 & CSS3:** Sem frameworks externos, estilizado com CSS Variables e layout responsivo (Desktop Nav + Mobile Bottom Sheet).
- **JavaScript (Vanilla JS - ES6):** Componentização por `<template>`, manipulação de DOM e controle de estado local.
- **Service Worker:** Cache offline das dependências estáticas.

### Backend & Nuvem
- **Cloudflare Workers:** API serverless executada na borda (*edge*).
- **Cloudflare D1:** Banco de dados SQL relacionável baseado em SQLite.
- **Wrangler CLI:** Ferramenta de gerenciamento e deploy da infraestrutura Serverless.

---

## 📁 Estrutura do Projeto

```text
├── assets/
│   ├── css/style.css           # Estilos e variáveis de tema
│   └── js/app.js               # Aplicação client-side e gerenciamento de estado
├── worker/
│   ├── index.js                # API REST do Worker (Auth + Sincronização)
│   ├── schema.sql              # Esquema do banco de dados D1
│   └── wrangler.example.toml   # Template de configuração do Cloudflare (Renomeie para wrangler.toml)
├── index.html                  # Interface web principal
├── manifest.json               # Manifesto PWA
└── sw.js                       # Service Worker para cache e PWA
```

---

## 🔧 Configuração e Deploy

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado.
- Conta na [Cloudflare](https://dash.cloudflare.com/).
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) instalado globalmente ou via `npx`.

```bash
npm install -g wrangler
```

### 1. Configurando o Banco de Dados (Cloudflare D1)

Crie o banco de dados D1 no painel da Cloudflare ou via linha de comando:

```bash
wrangler d1 create saldosimples-db
```

Copie o `database_id` retornado e atualize o arquivo `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "saldosimples-db"
database_id = "SEU_DATABASE_ID_AQUI"
```

Execute as migrações para criar as tabelas do banco de dados:

```bash
wrangler d1 execute saldosimples-db --file=./worker/schema.sql
```

### 2. Configurando Segredos do Servidor

No terminal, defina a chave secreta para a assinatura dos tokens JWT:

```bash
wrangler secret put SESSION_SECRET
```

### 3. Deploy do Backend e Frontend

Dentro do diretório `worker/`, execute o deploy:

```bash
cd worker
wrangler deploy
```

---

## 🔐 Segurança e Rate Limiting

- **Armazenamento de Senhas:** Utiliza derivação de chaves via PBKDF2 (100.000 iterações com SHA-256) e *salt* individual de 16 bytes.
- **Comparação Segura:** Proteção contra ataques de tempo (*timing-safe comparison*) na validação de credenciais.
- **Rate Limit:** Bloqueio de tentativas excessivas de login/cadastro por IP e e-mail via tabela de auditoria `auth_attempts`.

---

## 📄 Licença

Este projeto está sob a licença [MIT](./LICENSE).