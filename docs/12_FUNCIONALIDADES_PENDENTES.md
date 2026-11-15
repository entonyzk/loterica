# 12. Lista de Funcionalidades Pendentes (Etapas 2 a 8)

As funcionalidades abaixo foram arquiteturalmente preparadas na Etapa 1 (tabelas PostgreSQL, módulos e contratos OpenAPI), permanecendo explicitamente identificadas como **Planejadas**:

1. **Etapa 2 — Regras Oficiais e Ingestão de Dados Históricos**
   - Verificação e carga das regras matemáticas oficiais versionadas em `lottery_rule_versions` para cada modalidade.
   - Validação automatizada de `data_sources` e ingestão de resultados históricos reais (`contests`, `drawn_numbers`, `prize_tiers`).
   - Exibição real dos últimos resultados no Dashboard e Histórico.

2. **Etapa 3 — Estatísticas Descritivas e Análises**
   - Implementação de `GET /api/statistics/:lotteryId` e `POST /api/analyses`.
   - Cálculo de frequências observadas, atrasos, distribuições e testes Qui-Quadrado no motor Python (`/math_engine` com Pandas/SciPy).

3. **Etapa 4 — Simulador Monte Carlo**
   - Implementação de `POST /api/simulations` com execução assíncrona/em lote, `random_seed` reproduzível e persistência em `simulations`.

4. **Etapa 5 — Estratégias e Backtesting Histórico**
   - Cadastro de estratégias em `strategies` e execução retrospectiva em `backtest_runs` com métricas estatísticas transparentes.

5. **Etapa 6 — Gerador de Jogos e Fechamentos Combinatórios**
   - Construção de combinações válidas conforme `lottery_rule_versions` e geração de matrizes de fechamento $(v, k, t, m)$ verificáveis, além de registro em `user_bets`.

6. **Etapa 7 — Relatórios e Interpretação Assistida por Gemini**
   - Geração de relatórios explicativos usando `server/modules/ai/gemini-service.ts` estritamente sobre resultados já computados pelo motor matemático.

7. **Etapa 8 — Empacotamento Android Nativo e Publicação**
   - Geração do projeto Android via Capacitor (`npx cap add android`), integração de Push Notifications (FCM) e compilação de APK/AAB assinado para Google Play.
