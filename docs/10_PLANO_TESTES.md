# 10. Plano de Testes — LOTUS AI

## Estratégia em Camadas
1. **Verificação Estática e Compilação**
   - `npm run lint` (`tsc --noEmit`): garante tipagem estrita entre schema Drizzle, rotas Express e componentes React.
   - `npm run build` (`vite build`): garante empacotamento de produção e geração do Service Worker PWA (`sw.js` + `manifest.webmanifest`).

2. **Testes Unitários Matemáticos e de Segurança (`tests/foundation.test.ts` via Vitest)**
   - Combinatória exata em `BigInt` (`exactCombinationsBigInt`) para evitar overflow de ponto flutuante.
   - Soma unitária da distribuição hipergeométrica ($\sum_{h=0}^{\min(k,m)} P(X=h) = 1$).
   - Segurança criptográfica: hashing `scrypt` com salt único e verificação em tempo constante (`verifyPassword`).

3. **Testes de Contrato REST e Banco PostgreSQL (`tests/foundation.test.ts`)**
   - `GET /api/health` retornando status operacional e axioma de independência.
   - `GET /api/docs/openapi.json` validando estrutura OpenAPI 3.1.
   - `GET /api/lotteries` e `GET /api/lotteries/mega-sena` consultando dados reais no Cloud SQL PostgreSQL.
   - `GET /api/contests` confirmando ausência de resultados inventados na Etapa 1.
   - Proteção de rotas privadas: `401 UNAUTHORIZED` em `/api/users/profile` e `/api/admin/data-sources` sem token.
   - Retorno `501 NOT_IMPLEMENTED` nos endpoints planejados para etapas futuras (`/api/statistics/1`, `/api/simulations`).
   - Retorno `400 VALIDATION_ERROR` para parâmetros inválidos via Zod.

4. **Testes Planejados para Próximas Etapas**
   - Etapa 2: Validação de integridade na ingestão de concursos e checksum de fontes oficiais.
   - Etapa 3–4: Testes científicos em `pytest` comparando saídas NumPy/SciPy contra valores de referência analíticos e reprodutibilidade de `random_seed`.
   - Etapa 7–8: Testes E2E responsivos (Web + Android WebView) e auditoria de carga.
