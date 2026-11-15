# 07. Plano de Hospedagem e Infraestrutura

## Arquitetura Recomendada em Produção (Google Cloud Platform)
1. **Aplicação Web + API Gateway (Google Cloud Run)**
   - Executa o servidor unificado (`node server.ts`) na porta `3000`/`PORT`.
   - Escala horizontalmente conforme demanda, com TLS automático e suporte direto ao Cloud SQL Auth Proxy via Unix Socket (`SQL_HOST`).
   - Serve simultaneamente o frontend React/PWA (`dist/`) e os endpoints REST (`/api/*`) consumidos pela Web e pelo app Android Capacitor.

2. **Banco de Dados Relacional (Cloud SQL for PostgreSQL)**
   - Instância gerenciada (`ai-studio-457ef956`, região `us-east1`).
   - Separação de credenciais: usuário restrito `SQL_USER` para runtime da aplicação e `SQL_ADMIN_USER` exclusivamente para migrações Drizzle Kit.
   - Backups automáticos diários com retenção configurável e Point-in-Time Recovery (PITR) em produção.

3. **Motor Matemático Científico (Serviço Python Dedicado — Cloud Run / Container Python)**
   - Container Docker baseado em `python:3.11-slim` executando `uvicorn app.main:app` com NumPy, SciPy e Pandas.
   - Acessível exclusivamente pela rede privada/interna do backend Node.js através de `MATH_ENGINE_URL` (nunca exposto diretamente ao navegador).

4. **Autenticação e Identidade (Firebase Authentication)**
   - Projeto `seventh-flare-wn50x` com emissão de ID Tokens JWT validados no servidor via `firebase-admin`.

5. **Separação Desenvolvimento vs. Produção**
   - `NODE_ENV=development`: Middleware Vite integrado, logs detalhados e `CORS_ORIGIN` local.
   - `NODE_ENV=production`: Assets estáticos pré-compilados em `dist/`, mensagens de erro sanitizadas e CORS restrito aos domínios oficiais e origens Capacitor.
