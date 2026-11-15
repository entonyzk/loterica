# 11. Lista de Funcionalidades Implementadas (Etapa 1)

1. **Identidade Visual e Shell Multiplataforma**
   - Interface escura em preto e grafite (`#0A0B0E` / `#12141A`) com destaques em dourado (`#D4AF37`) e roxo tecnológico (`#7C3AED`).
   - Tipografia dedicada (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono` com numerais tabulares).
   - Navegação responsiva completa (Sidebar desktop com 9 itens + Painel Administrativo; barra inferior mobile para toque).
   - Suporte PWA completo (`vite-plugin-pwa`, manifest, Service Worker, ícones PNG reais, `PWAInstallButton` e `OfflineIndicator`).
   - Configuração `capacitor.config.ts` preparada para empacotamento Android.

2. **Banco de Dados Cloud SQL PostgreSQL (14 Entidades)**
   - Schema relacional criado e verificado no Cloud SQL via Drizzle ORM: `users`, `lottery_types`, `lottery_rule_versions`, `special_events`, `data_sources`, `contests`, `drawn_numbers`, `prize_tiers`, `analysis_history`, `simulations`, `strategies`, `backtest_runs`, `user_bets`, `audit_logs`.
   - Chaves estrangeiras e índices compostos aplicados.
   - Catálogo estrutural inicial populado com 8 modalidades principais, 3 eventos especiais vinculados (sem duplicar regras) e 2 fontes oficiais marcadas como `unverified`.

3. **Backend Express + Segurança + Contratos REST**
   - Rotas implementadas e testadas: `GET /api/health`, `GET /api/docs/openapi.json`, `GET /api/lotteries`, `GET /api/lotteries/:id`, `GET /api/contests`, `GET /api/contests/:id`, `GET /api/users/profile`, `GET /api/admin/data-sources`, `GET /api/admin/audit-logs`.
   - Middleware de autenticação Firebase JWT (`requireAuth`), RBAC (`requireRole`), validação Zod (`validateQuery`/`validateBody`), Helmet, CORS e Rate Limit.
   - Módulo isolado de IA (`server/modules/ai/gemini-service.ts`) e ponte do motor matemático (`/math_engine` + `server/modules/math-bridge/client.ts`).

4. **Telas e Fluxos Ativos na Interface**
   - **Início**: Visão geral arquitetural, gráfico SVG teórico de referência e estado vazio honesto para últimos resultados.
   - **Loterias**: Catálogo interativo consultado do PostgreSQL com filtros e detalhes de eventos especiais.
   - **Laboratório Matemático**: Explorador combinatório determinístico livre ($N, k, m$) para validação de $C(N,m)$ e distribuição hipergeométrica.
   - **Histórico**: Consulta real de concursos (estado vazio transparente até a Etapa 2).
   - **Minha Conta**: Login real via Google (Firebase) sincronizado com `users` no PostgreSQL.
   - **Painel Administrativo**: Matriz RBAC, fontes oficiais protegidas e inspetor ao vivo do OpenAPI 3.1.
