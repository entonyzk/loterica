# 12. Lista de Funcionalidades Pendentes, Preparadas e Limitações de Ambiente

## 1. O que está apenas preparado estruturalmente (Aguardando Regras Oficiais / Próximas Etapas)
- **Modalidades com status `awaiting_rules`**: Quina, Lotomania, Timemania, Dupla Sena, Dia de Sorte e Super Sete possuem registro no catálogo PostgreSQL e especificação estrutural no registro Python (`app/models/registry.py`), porém **não possuem regras verificadas nem tarifas ingeridas** — qualquer cálculo por modalidade para elas retorna `409 MODALITY_AWAITING_CONFIGURATION` de forma transparente.
- **Modelos combinatórios futuros (`app/models/prepared.py`)**: `multi_group_combinatorial`, `positional_columns` (Super Sete), `multi_extraction` (Dupla Sena) e `extra_field_combinatorial` (Timemania / Dia de Sorte / +Milionária) estão registrados como estruturais e retornam **HTTP 501** (`MATH_MODEL_NOT_IMPLEMENTED`) até homologação documental em etapa futura.
- **Etapas 3 a 8 (fora do escopo atual da Etapa 2)**:
  - **Etapa 3**: Ingestão completa de concursos históricos reais (`contests`, `drawn_numbers`, `prize_tiers`), estatísticas descritivas (`GET /api/statistics/:lotteryId`) e análises persistidas (`POST /api/analyses`).
  - **Etapa 4**: Simulador Monte Carlo (`POST /api/simulations`) com semente reproduzível.
  - **Etapa 5**: Estratégias e Backtesting histórico (`strategies`, `backtest_runs`).
  - **Etapa 6**: Gerador de jogos e fechamentos combinatórios $(v, k, t, m)$ + `user_bets`.
  - **Etapa 7**: Relatórios explicativos assistidos por Gemini sobre resultados já calculados.
  - **Etapa 8**: Empacotamento Android nativo completo (`npx cap add android`), FCM e APK/AAB assinado.

## 2. O que depende de integração externa em tempo de execução
- **Microsserviço Python FastAPI (`MATH_ENGINE_URL`)**:
  - A aba **Por Modalidade** do Laboratório Matemático agora depende exclusivamente de `POST /api/math/python/specialized`, que exige o microsserviço `/math_engine` ativo e acessível na URL configurada em `MATH_ENGINE_URL` (ex.: servidor Uvicorn/FastAPI em execução com `fastapi`, `pydantic`, `uvicorn`, `numpy`, `scipy`, `pandas`).
  - Se `MATH_ENGINE_URL` não estiver definida ou o serviço Python estiver fora do ar, o backend retorna `503 MATH_ENGINE_UNAVAILABLE` (ou `504 MATH_ENGINE_TIMEOUT`) e a interface exibe explicitamente a indisponibilidade com botão de nova tentativa, sem simular nem substituir resultados localmente.
- **Autenticação Google (Firebase) em produção e ingestão automática Caixa**:
  - Contas reais dependem de token JWT emitido pelo projeto Firebase configurado em `.env` / `firebase-applet-config.json`.

## 3. O que ainda não foi testado neste ambiente (Limitação de Container)
- **Execução completa via `pytest` e `FastAPI TestClient`**:
  - O container atual do workspace possui `/usr/bin/python3` apenas com a **biblioteca padrão Python** (sem `pip`, sem `uv`, sem `pytest`, `fastapi`, `pydantic`, `numpy`, `scipy` ou `pandas` instalados).
  - Por esse motivo, testes que importam `pytest`, `pydantic` e `fastapi.testclient` em `math_engine/tests/test_math_engine.py` não puderam ser executados via `pytest` dentro deste container.
  - Como mitigação honesta, a compilação sintática (`python3 -m py_compile`) de todos os módulos Python e a execução direta em Python stdlib das funções de `app.core.axioms`, `app.models.registry` e `app.models.hypergeometric` (Mega-Sena, Lotofácil, múltiplas, `at_least_one_win` e união exata de apostas simples) foram validadas diretamente, além da suíte completa Vitest (unitários JS/TS + UI JSDOM + integração real PostgreSQL Cloud SQL + stubs HTTP da ponte Python) e `tsc --noEmit` / `vite build`.
