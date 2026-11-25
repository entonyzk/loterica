# 12. Lista de Funcionalidades Pendentes, Preparadas e Limitações de Ambiente

## 1. O que está apenas preparado estruturalmente (Aguardando Regras Oficiais / Próximas Etapas)
- **Modalidades com status `awaiting_rules`**: Quina, Lotomania, Timemania, Dupla Sena, Dia de Sorte e Super Sete possuem registro no catálogo PostgreSQL e especificação estrutural no registro Python (`app/models/registry.py`), porém **não possuem regras verificadas nem tarifas ingeridas** — qualquer cálculo por modalidade (inclusive no Laboratório de Combinações) retorna `409 MODALITY_AWAITING_CONFIGURATION` de forma transparente.
- **Modelos combinatórios futuros (`app/models/prepared.py`)**: `multi_group_combinatorial`, `positional_columns` (Super Sete), `multi_extraction` (Dupla Sena) e `extra_field_combinatorial` (Timemania / Dia de Sorte / +Milionária) estão registrados como estruturais e retornam **HTTP 501** (`MATH_MODEL_NOT_IMPLEMENTED`) até homologação documental em etapa futura.
- **Próximas etapas do roadmap (fora do escopo atual — Etapa 3 concluída)**:
  - **Etapa 4+ — Ingestão Histórica & Estatísticas Descritivas**: Ingestão completa de concursos históricos reais (`contests`, `drawn_numbers`, `prize_tiers`), estatísticas descritivas (`GET /api/statistics/:lotteryId`) e análises persistidas (`POST /api/analyses`).
  - **Etapa 5+ — Simulador Monte Carlo**: Simulações com semente reproduzível (`POST /api/simulations`).
  - **Etapa 6+ — Estratégias Persistidas & Backtesting Histórico**: Persistência de `strategies`, `user_bets` e execução de `backtest_runs`.
  - **Etapa 7+ — Relatórios Explicativos Gemini**: Interpretação assistida apenas sobre resultados já calculados pelo motor matemático.
  - **Etapa 8+ — Empacotamento Android Nativo**: Projeto Android completo (`npx cap add android`), FCM e APK/AAB assinado.

## 2. O que depende de integração externa em tempo de execução
- **Microsserviço Python FastAPI (`MATH_ENGINE_URL`)**:
  - Os cálculos por modalidade do Laboratório Matemático (`/api/math/python/specialized`) e todo o Laboratório de Combinações (`/api/math/python/combinations/{analyze,coverage,generate,compare}`) dependem exclusivamente do microsserviço `/math_engine` ativo e acessível na URL configurada em `MATH_ENGINE_URL` (executando com `fastapi`, `pydantic`, `uvicorn`, `numpy`, `scipy`, `pandas`).
  - Se `MATH_ENGINE_URL` não estiver definida ou o serviço Python estiver inacessível, o backend retorna `503 MATH_ENGINE_UNAVAILABLE` (ou `504 MATH_ENGINE_TIMEOUT`) e a interface exibe explicitamente a indisponibilidade com opção de nova tentativa, sem simular nem substituir resultados localmente.
- **Autenticação Google (Firebase) em produção e ingestão automática Caixa**:
  - Contas reais dependem de token JWT emitido pelo projeto Firebase configurado em `.env` / `firebase-applet-config.json`.

## 3. O que ainda não foi testado neste ambiente (Limitação de Container)
- **Execução completa via `pytest`, `Pydantic` e `FastAPI TestClient`**:
  - O container atual do workspace possui `/usr/bin/python3` (Python 3.11.2) apenas com a **biblioteca padrão Python** (sem `pip`, sem `uv`, sem `pytest`, `fastapi`, `pydantic`, `numpy`, `scipy` ou `pandas` instalados).
  - Por esse motivo, os testes de contrato HTTP (`TestClient`) e validação `pydantic.ValidationError` em `math_engine/tests/test_math_engine.py` não puderam ser executados via `pytest` dentro deste container e exigem ambiente com `math_engine/requirements.txt` instalado.
  - Como mitigação honesta e executada neste container, foram rodados:
    1. `python3 -m compileall -q math_engine` (todos os módulos Python válidos sintaticamente).
    2. Execução direta em Python 3.11.2 stdlib de todas as funções puras/combinatórias de `math_engine/tests/test_math_engine.py` (`app.core.axioms`, `app.models.*`, `app.combinations.combinatorics_ops`, `app.combinations.coverage`, `app.combinations.generator`, incluindo os cenários de auditoria 1 a 10 sem `TestClient`).
    3. Suíte completa JS/TS com Vitest (`npm test`: unitários backend/math-bridge/combinações, UI JSDOM e integração), `tsc --noEmit` (`npm run lint`) e `vite build` (`npm run build`).

