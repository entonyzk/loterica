# 09. Lista de Dependências — LOTUS AI

## 1. Frontend & PWA (Runtime)
- `react` / `react-dom` (`^19.0.1`) — Biblioteca de interface reativa
- `lucide-react` (`^0.546.0`) — Ícones vetoriais minimalistas
- `motion` (`^12.23.24`) — Animações discretas em propriedades de compositor
- `firebase` — SDK cliente para autenticação Google/Firebase
- `vite-plugin-pwa` — Geração automática de Service Worker e Web App Manifest

## 2. Backend & Segurança (Runtime)
- `express` (`^4.21.2`) — Servidor HTTP REST e gateway unificado
- `drizzle-orm` & `pg` — ORM type-safe e driver PostgreSQL com pool de conexões
- `firebase-admin` — Verificação de ID Tokens JWT no servidor
- `zod` — Validação declarativa de entradas e contratos
- `helmet` — Cabeçalhos HTTP de proteção
- `cors` — Controle de origens autorizadas
- `express-rate-limit` — Mitigação contra abuso de requisições
- `@google/genai` (`^2.4.0`) — SDK oficial servidor para modelos Gemini
- `dotenv` (`^17.2.3`) — Carregamento de variáveis de ambiente locais

## 3. Desenvolvimento, Build & Testes (DevDependencies)
- `typescript`, `vite`, `@tailwindcss/vite`, `tailwindcss`, `autoprefixer`, `esbuild`
- `tsx` — Executor TypeScript em desenvolvimento
- `drizzle-kit` — Gerenciamento e push de schema PostgreSQL
- `vitest` — Framework de testes unitários e de integração
- `@types/node`, `@types/express`, `@types/pg`, `@types/cors`, `@types/react`, `@types/react-dom`

## 4. Motor Matemático Python (`/math_engine/requirements.txt`)
- `numpy>=2.1.0` — Álgebra linear, vetores e geradores PRNG auditáveis
- `scipy>=1.14.0` — Distribuições estatísticas e testes de aderência
- `pandas>=2.2.0` — Séries temporais e tabulação de grandes volumes históricos
- `fastapi>=0.115.0` & `uvicorn[standard]>=0.32.0` — Exposição REST do motor isolado
- `pydantic>=2.9.0` — Contratos estritos de entrada/saída
- `pytest>=8.3.0` — Testes científicos do motor Python

## 5. Empacotamento Android Futuro (Capacitor)
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/push-notifications` (documentados em `docs/06_INTEGRACAO_ANDROID.md`)
