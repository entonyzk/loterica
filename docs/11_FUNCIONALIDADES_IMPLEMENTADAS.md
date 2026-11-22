# 11. Lista de Funcionalidades Implementadas (Até Etapa 2 — Correção Matemática)

## 1. O que já funciona (Fundação Validada da Etapa 1 + Infraestrutura)
1. **Identidade Visual e Shell Multiplataforma**
   - Interface escura em preto e grafite (`#0A0B0E` / `#12141A`) com destaques em dourado (`#D4AF37`) e roxo (`#7C3AED`).
   - Tipografia dedicada (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono` com numerais tabulares).
   - Navegação responsiva completa (Sidebar desktop + barra inferior mobile com alvos `>= 44px` e `safe-area-inset-bottom`).
   - Suporte PWA completo (`vite-plugin-pwa`, manifest, Service Worker, `PWAInstallButton`, `OfflineIndicator`) e `capacitor.config.ts` preparado para Android.
2. **Banco de Dados Cloud SQL PostgreSQL (14 Entidades + Vigência Temporal)**
   - Schema relacional criado e migrado via Drizzle ORM (`users`, `lottery_types`, `lottery_rule_versions`, `special_events`, `data_sources`, `contests`, `drawn_numbers`, `prize_tiers`, `analysis_history`, `simulations`, `strategies`, `backtest_runs`, `user_bets`, `audit_logs`).
   - Regras versionadas e verificadas da **Mega-Sena** (R$ 6,00 vigente desde 2025-07-10 + versão histórica R$ 5,00) e **Lotofácil** (R$ 3,50 vigente desde 2025-07-09 + versão histórica R$ 3,00), com seleção estrita por intervalo `[validFrom, validTo)` e concurso histórico.
3. **Backend Express + Segurança + Contratos REST**
   - Rotas ativas: `GET /api/health`, `GET /api/docs/openapi.json`, `GET /api/lotteries`, `GET /api/lotteries/:id`, `GET /api/contests`, `GET /api/contests/:id`, `POST /api/math/local/theoretical`, `POST /api/math/local/specialized`, `GET /api/math/python/health`, `POST /api/math/python/theoretical`, `POST /api/math/python/specialized`, `GET/PATCH /api/users/profile`, `GET /api/users/:userId/profile`, `GET /api/admin/data-sources`, `GET /api/admin/audit-logs`.
   - Firebase Auth JWT (`requireAuth`), RBAC (`requireRole`), validação Zod (`validateBody`/`validateQuery`), Helmet, CORS e Rate Limit.

## 2. O que foi implementado na Etapa 2 e nesta Rodada de Correção Matemática
1. **Motor Matemático Especializado (Python FastAPI `/math_engine` + Auditoria Node.js)**
   - Aritmética racional exata (`fractions.Fraction` / `math.comb` em Python e `BigInt` em Node.js) para **Mega-Sena** ($N=60, k=6, m \in [6..20]$, Sena/Quina/Quadra) e **Lotofácil** ($N=25, k=15, m \in [15..20]$, 11–15 acertos).
   - **Integração exclusiva da interface por modalidade**: no modo **Por Modalidade**, `MathLabView.tsx` consulta exclusivamente `POST /api/math/python/specialized` (que valida regras vigentes no PostgreSQL, encaminha ao Python via HTTP, audita todas as frações/invariantes/custos e retorna ao frontend). Exibe estados explícitos de carregamento, erro e indisponibilidade (`503`/`504`) **sem fallback silencioso para TypeScript local**.
   - O modo **Parâmetros Livres** continua funcional independentemente do catálogo (cálculo combinatório local `BigInt` + verificação teórica opcional via `/api/math/python/theoretical`).
2. **Clareza nas Apostas Múltiplas (Separação A · B · C)**
   - **A.** `P(H_volante = h)`: probabilidade de o volante acertar exatamente $h$ dezenas sorteadas.
   - **B.** Desdobramento em apostas simples embutidas (identidade de Vandermonde $C(h, t) \cdot C(m-h, k-t)$) e quantidade esperada de apostas simples premiadas por concurso (`expected_embedded_wins_per_draw`).
   - **C.** `at_least_one_win` ($P(\ge 1\text{ aposta na faixa } t) = \sum_{h: w(h, t) > 0} P(H_{\text{volante}} = h)$), com `triggering_volante_hits` (ex.: `h ∈ {5, 6}` para Quina na Mega-Sena com $m=7$) e memória de cálculo expansível por faixa.
3. **Comparação de Apostas Simples vs. Múltiplas sem Falsa Independência**
   - Mantém $P(\text{faixa principal}) = q / C(N, k)$ e valor esperado de bilhetes premiados $E = q \cdot p$ sem apresentar $1 - (1-p)^q$ como probabilidade exata.
   - Informa explicitamente quando a probabilidade de pelo menos um prêmio secundário/global **depende da sobreposição** entre os jogos (`requires_explicit_combinations`).
   - Quando combinações explícitas distintas (`simpleBets` / `simple_bets`, 1 a 12 jogos) são informadas, calcula a **união exata** $\bigcup_{i=1}^q E_i$ (programação dinâmica exata sobre átomos de interseção, incluindo dualidade complementar na Lotofácil), resumo de sobreposição par-a-par e memórias de cálculo auditadas.
   - Qualquer referência a $1 - (1 - p)^q$ permanece isolada em `illustrative_independent_approximation` com `is_exact: false` e aviso explícito de que assume hipótese falsa de independência.
4. **Validação Estrita de Modalidades e Contratos no Serviço Python (`/v1/probabilities/specialized`)**
   - Rejeita `lottery_code` desconhecido/inventado com **HTTP 404** (sem fallback genérico).
   - Rejeita `generic-reference` na rota especializada com **HTTP 422** no Python e **HTTP 400** (`GENERIC_CODE_NOT_ALLOWED`) no backend Node.js.
   - Valida compatibilidade de `math_model_type` e parâmetros oficiais contra o registro da modalidade, duplicidade de faixas de prêmio/prêmio principal e consistência integral de `simple_bets`.
