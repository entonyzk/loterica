# 01. Documento de Arquitetura — LOTUS AI

## Visão Geral
**LOTUS AI** é uma plataforma modular de inteligência matemática, estatística descritiva e simulação auditável de loterias brasileiras, projetada com uma única base de código compartilhada para **Web Responsiva**, **PWA Instalável** e **Aplicativo Android (via Capacitor)**.

## Pilares Tecnológicos (Etapa 1)
1. **Frontend Multiplataforma (React + TypeScript + Tailwind CSS v4 + VitePWA)**
   - Interface responsiva (desktop `1440px+`, tablet e mobile com navegação inferior dedicada).
   - Identidade visual escura (Preto/Grafite `#0A0B0E`/`#12141A`, destaque Dourado `#D4AF37`, secundário Roxo Tecnológico `#7C3AED`) com tipografia tabular (`JetBrains Mono`).
   - Empacotamento PWA nativo (`vite-plugin-pwa`) e configuração pronta para Capacitor Android (`capacitor.config.ts`).

2. **Backend REST Unificado (Node.js + Express + TypeScript)**
   - API REST única servindo Web, PWA e futuro app Android.
   - Validação estrita com `zod`, proteção HTTP com `helmet`, `cors` e `express-rate-limit`.
   - Autenticação via Firebase ID Token (`firebase-admin`) com sincronização automática de usuários e controle RBAC.

3. **Banco de Dados Relacional (PostgreSQL — Cloud SQL + Drizzle ORM)**
   - 14 tabelas relacionais normalizadas com chaves estrangeiras, restrições `UNIQUE` e índices B-Tree compostos para grandes volumes históricos.
   - Pool de conexões `pg.Pool` configurado via Object Method e Drizzle ORM type-safe.

4. **Motor Matemático Científico (`/math_engine` — Python + FastAPI + NumPy + SciPy + Pandas)**
   - Completamente isolado da interface visual e do servidor Node.js.
   - Comunica-se via contrato HTTP JSON (`MATH_ENGINE_URL`).
   - *Nota de Ambiente*: O container padrão do Google AI Studio executa Node.js e não possui `numpy`, `scipy` e `pandas` instalados globalmente; o motor Python está estruturado como microsserviço independente pronto para deploy externo (Docker/Cloud Run).

5. **Camada de Inteligência Artificial (`server/modules/ai/gemini-service.ts`)**
   - Integração exclusiva no servidor com `@google/genai` (`gemini-4-hydrogen`).
   - Restrita à explicação conceitual e síntese de relatórios já calculados. Nunca realiza cálculos probabilísticos nem inventa porcentagens de previsão.

## Princípio Matemático Fundamental
Em sorteios justos e independentes, resultados anteriores não alteram a probabilidade matemática dos próximos resultados ($P(E_t \mid H_{t-1}) = P(E_t)$). A plataforma separa explicitamente probabilidade teórica, frequência histórica, simulações e desempenho retrospectivo (backtesting).
