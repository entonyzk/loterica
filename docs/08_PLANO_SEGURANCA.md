# 08. Plano de Segurança — LOTUS AI

## Controles Implementados na Etapa 1 (Auditados)
1. **Autenticação, Bootstrap Admin e Identidade**
   - Autenticação via Firebase Auth com verificação criptográfica obrigatória de ID Token no backend (`adminAuth.verifyIdToken`).
   - Provisionamento seguro do primeiro `super_admin` via `BOOTSTRAP_ADMIN_EMAIL`: ocorre transacionalmente apenas quando o e-mail verificado no Firebase coincide E ainda não existe nenhum `admin` ou `super_admin` no PostgreSQL, gerando registro em `audit_logs` (`BOOTSTRAP_FIRST_ADMIN`).
   - Tokens mantidos apenas em memória no contexto React (nunca gravados em `localStorage`).
   - Suporte a hashing `scrypt` com salt aleatório de 16 bytes e comparação em tempo constante (`crypto.timingSafeEqual`).

2. **Autorização RBAC e Isolamento de Dados**
   - Middleware `requireAuth` e `requireRole(['admin', 'super_admin'])` aplicados em `/api/admin/*`.
   - Contas suspensas são bloqueadas com `403 ACCOUNT_SUSPENDED`.
   - Rotas de usuário (`GET /api/users/profile`, `PATCH /api/users/profile`, `GET /api/users/:userId/profile`) impõem isolamento estrito por `req.dbUser.id`, impedindo consulta ou alteração de dados de outras contas (`403 FORBIDDEN`) e rejeitando campos protegidos (`role`, `status`) via `.strict()`.

3. **CORS, Helmet CSP e Rate Limiting**
   - Política CORS estrita em `server/config/security.ts`: em produção (`NODE_ENV=production`), somente origens listadas em `CORS_ORIGIN` / `APP_URL` são aceitas; origens não autorizadas recebem `403 CORS_ORIGIN_FORBIDDEN`.
   - Helmet ativo com Content Security Policy (CSP) compatível com React, Google Fonts, Firebase Auth e Service Worker (`objectSrc: ['none']`, `baseUri: ['self']`, `frameAncestors: ['self']`).
   - `trust proxy = 1` e limitadores de taxa diferenciados (`/api`: 300 req/15min; `/api/admin` e `/api/users`: 60 req/15min).

4. **Proteção contra SQL Injection e Integridade Relacional**
   - Todas as consultas utilizam queries parametrizadas via Drizzle ORM.
   - Restrições `CHECK` e `UNIQUE` no PostgreSQL impedem dezenas duplicadas no mesmo concurso, faixas de premiação duplicadas, valores negativos e períodos inválidos.

5. **Segredos e Ordem de Carregamento**
   - `import 'dotenv/config'` executado na primeira linha de `server.ts`, antes da importação de qualquer módulo de negócio ou banco.
   - Nenhuma chave (`GEMINI_API_KEY`, credenciais `SQL_*`, `BOOTSTRAP_ADMIN_EMAIL`) é enviada ao frontend.
