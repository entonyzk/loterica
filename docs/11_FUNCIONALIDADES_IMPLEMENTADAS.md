# 11. Lista de Funcionalidades Implementadas (Até Etapa 3 — Laboratório Avançado de Combinações)

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
   - Rotas ativas: `GET /api/health`, `GET /api/docs/openapi.json`, `GET /api/lotteries`, `GET /api/lotteries/:id`, `GET /api/contests`, `GET /api/contests/:id`, `POST /api/math/local/theoretical`, `POST /api/math/local/specialized`, `GET /api/math/python/health`, `POST /api/math/python/theoretical`, `POST /api/math/python/specialized`, `POST /api/math/python/combinations/analyze`, `POST /api/math/python/combinations/coverage`, `POST /api/math/python/combinations/generate`, `POST /api/math/python/combinations/compare`, `GET/PATCH /api/users/profile`, `GET /api/users/:userId/profile`, `GET /api/admin/data-sources`, `GET /api/admin/audit-logs`.
   - Firebase Auth JWT (`requireAuth`), RBAC (`requireRole`), validação Zod (`validateBody`/`validateQuery`), Helmet, CORS e Rate Limit.

## 2. O que foi implementado na Etapa 2 (Motor Matemático Especializado)
1. **Motor Matemático Especializado (Python FastAPI `/math_engine` + Auditoria Node.js)**
   - Aritmética racional exata (`fractions.Fraction` / `math.comb` em Python e `BigInt` em Node.js) para **Mega-Sena** ($N=60, k=6, m \in [6..20]$, Sena/Quina/Quadra) e **Lotofácil** ($N=25, k=15, m \in [15..20]$, 11–15 acertos).
   - No modo **Por Modalidade**, `MathLabView.tsx` consulta exclusivamente `POST /api/math/python/specialized` (com estados explícitos de carregamento, erro e indisponibilidade `503`/`504`, sem fallback local silencioso). O modo **Parâmetros Livres** continua operando independentemente do catálogo.
2. **Clareza nas Apostas Múltiplas (Separação A · B · C) e União Exata**
   - Separa `P(H_volante = h)`, desdobramento em apostas simples embutidas (identidade de Vandermonde), `expected_embedded_wins_per_draw` e `at_least_one_win` com `triggering_volante_hits`.
   - Comparação de jogos simples vs. múltiplas sem falsa independência (união exata $\bigcup_{i=1}^q E_i$ para combinações explícitas de 1 a 12 jogos, com `illustrative_independent_approximation` isolada como `is_exact: false`).
3. **Validação Estrita de Modalidades no Serviço Python (`/v1/probabilities/specialized`)**
   - Rejeita `lottery_code` desconhecido com HTTP 404, rejeita `generic-reference` na rota especializada (HTTP 422 Python / HTTP 400 Node.js) e valida parâmetros e `math_model_type` contra o registro oficial.

## 3. O que foi implementado na Etapa 3 (Laboratório Avançado de Combinações + Correções de Auditoria)
1. **Análise de Universo Restrito, Fixas/Excluídas e Orçamento (`/v1/combinations/analyze`)**
   - `CombinationsLabView.tsx` com seletor de modalidade verificada (bloqueando modalidades `awaiting_rules` sem inventar parâmetros) e matriz numérica interativa para marcar dezenas **Fixas ($F$)**, **Excluídas ($E$)** e **Livres ($V$)**.
   - Cálculo exato de $|\Omega_{\text{restrito}}| = \binom{N - |E| - |F|}{m - |F|}$, fator de redução, desdobramento em apostas simples e orçamento exato em centavos com data e fonte oficial da tarifa.
   - Análise de conjunto submetido (`analyze_bet_set`): detecção de duplicatas, desperdício financeiro, interseções par-a-par, expansão exata em apostas simples distintas e rejeição estrita pré-cálculo de qualquer aposta que viole fixas, excluídas, duplicidades, limites $[1..N]$ ou contagem $m$.
2. **Cobertura Combinatória Exata de Subconjuntos (`/v1/combinations/coverage`)**
   - Contratos Python e Node.js recebem explicitamente `fixed_numbers` e `excluded_numbers` além de `pool_numbers`.
   - Validação rigorosa pré-contagem: rejeita apostas com tamanho inválido, duplicadas, fora do universo, contendo excluídas, sem fixas obrigatórias ou fora do pool ativo (sem filtragem silenciosa).
   - Razão exata `covered / total_pool_subsets`, flag `is_full_coverage_proven`, histograma de multiplicidade e aviso explícito de que cobertura de subconjuntos não equivale a garantia de premiação.
3. **Gerador Controlado de Combinações (`/v1/combinations/generate`)**
   - Suporta `exhaustive` (quando aplicável), `uniform_sampling`, `coverage_heuristic` e `combinatorial_search`, com semente reproduzível, filtros de composição (pares, soma, faixas, consecutivos, repetições), respeito estrito ao teto orçamentário e zero duplicatas geradas.
   - Classificação explícita entre solução exata e heurística/amostragem (sem prometer cobertura mínima ótima comprovada quando heurística).
4. **Comparador de Estratégias (`/v1/combinations/compare`)**
   - Compara até 5 estratégias lado a lado, com suporte a restrições próprias por estratégia (`fixed_numbers`, `excluded_numbers`), teto de orçamento individual (`max_budget_cents`) e apostas explícitas opcionais.
   - Valida integralmente todas as apostas explícitas e o custo efetivo contra o orçamento de cada estratégia **antes** de calcular probabilidades ou cobertura.
   - Identifica universos heterogêneos (`has_heterogeneous_universes`, `coverage_comparable_with_baseline`, `universe_comparison_notice`) e omite delta enganoso em pontos percentuais (`null` / `"Universos distintos"`) quando o pool ativo ou `target_subset_size` diferem da estratégia base.
   - Interface limpa resultados obsoletos em erro, exibe razões de rejeição por aposta/estratégia e desabilita submissão quando há violações locais.

