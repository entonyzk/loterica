# 10. Plano de Testes — LOTUS AI

## Separação de Suítes e Execução Reproduzível

1. **Verificação Estática e Compilação**
   - `npm run lint` (`tsc --noEmit` em `strict: true`): valida contratos TypeScript entre Drizzle, Express e React.
   - `npm run build` (`vite build`): gera bundle de produção e Service Worker PWA (`sw.js` + `manifest.webmanifest`).

2. **Testes Unitários Independentes (`npm run test:unit` -> `tests/unit/`)**
   Executam sem dependência de PostgreSQL ou Firebase, reproduzíveis em qualquer ambiente local ou CI:
   - `tests/unit/math-precision.test.ts`:
     - Referências combinatórias exatas (`Mega-Sena`, `Lotofácil`, `Quina`, `C(100,20)`).
     - Frações racionais brutas e simplificadas (MDC), preservação de probabilidades muito pequenas sem truncamento, eventos impossíveis como zero exato, rejeição de parâmetros inválidos e soma unitária (`<= 1e-9`).
     - Hashing `scrypt` e verificação em tempo constante.
     - Ponte HTTP Node.js/Python: validação de integridade matemática completa (`502 MATH_ENGINE_INTEGRITY_ERROR` para divergência de modalidade, parâmetros, combinações, numerador ou soma != 1), além de timeout (`504`) e indisponibilidade (`503`).
   - `tests/unit/security-cors.test.ts`:
     - Helmet CSP (`frame-ancestors`, `object-src 'none'`), política CORS dev/produção, OpenAPI 3.1, validação Zod (`400`) e rotas planejadas (`501`).
   - `tests/unit/ui-responsive.test.tsx`:
     - Navegação desktop/mobile com `safe-area` e alvos `>= 44px`, modo `Parâmetros Livres` vs. `Por Modalidade`, carregamento automático quando há regra verificada, comparação entre quantidades de dezenas e área expansível de detalhes matemáticos.

3. **Testes de Integração com Banco e Autenticação (`npm run test:integration` -> `tests/integration/`)**
   - `tests/integration/api-db.test.ts`:
     - Consulta PostgreSQL real (`/api/lotteries`, `/api/lotteries/:id`, `/api/contests`), verificação de ausência de regras/resultados inventados, autenticação Firebase JWT (`401`), isolamento estrito entre contas (`403`), bloqueio de escalação de privilégio (`400`) e RBAC administrativo (`403`/`200`).
     - **Banco de teste isolado**: quando `NODE_ENV=test`, `src/db/index.ts` prioriza `TEST_SQL_HOST`, `TEST_SQL_USER`, `TEST_SQL_PASSWORD` e `TEST_SQL_DB_NAME` (com fallback para `SQL_*` em ambientes onde apenas a instância principal de desenvolvimento está provisionada).

4. **Testes Python Científicos (`math_engine/tests/test_math_engine.py` via `pytest`)**
   - Cobre combinações exatas, distribuição hipergeométrica de referência (`Fraction`/`Decimal`), probabilidades muito pequenas, eventos impossíveis, parâmetros inválidos, soma igual a 1 (`DISTRIBUTION_SUM_TOLERANCE = 1e-9`) e contratos da API FastAPI.
   - Execução em ambiente Python com dependências instaladas (`cd math_engine && pytest`).
