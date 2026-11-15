# 03. Estrutura de Diretórios — LOTUS AI

```text
/
├── capacitor.config.ts               # Configuração Capacitor para empacotamento Android (APK/AAB)
├── firebase-applet-config.json       # Configuração Firebase Client/Admin (gerada pelo ambiente)
├── index.html                        # Entry point HTML, metadados PWA e tipografia
├── metadata.json                     # Metadados do aplicativo LOTUS AI
├── package.json                      # Dependências e scripts Node/Vite/Vitest
├── server.ts                         # Servidor unificado Express API + Vite SPA (porta 3000)
├── tsconfig.json                     # Configuração TypeScript estrita
├── vite.config.ts                    # Bundler Vite + VitePWA (Service Worker e Web Manifest)
├── public/                           # Ícones PWA (SVG + PNG 180/192/512/maskable)
├── docs/                             # Documentação técnica obrigatória da Etapa 1
├── math_engine/                      # Motor matemático Python isolado (FastAPI/NumPy/SciPy/Pandas)
│   ├── README.md
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       └── core/
│           ├── axioms.py
│           └── contracts.py
├── server/                           # Módulos do Backend Node.js/TypeScript
│   ├── openapi.ts                    # Especificação OpenAPI 3.1 (implementadas + planejadas)
│   ├── middleware/
│   │   ├── auth.ts                   # Verificação Firebase JWT e RBAC
│   │   └── validate.ts               # Validação de entradas com Zod
│   └── modules/
│       ├── admin/router.ts           # Rotas administrativas protegidas e audit logs
│       ├── ai/gemini-service.ts      # Camada Gemini isolada (nunca calcula probabilidades)
│       ├── contests/router.ts        # Consulta de concursos verificados
│       ├── lotteries/router.ts       # Catálogo de modalidades e eventos especiais
│       ├── math-bridge/client.ts     # Ponte HTTP com /math_engine + combinatória exata
│       └── users/router.ts           # Perfil autenticado sincronizado
├── src/                              # Módulos do Frontend React + TypeScript + Tailwind v4
│   ├── App.tsx                       # Shell responsivo (Sidebar Desktop + Bottom Bar Mobile)
│   ├── index.css                     # Design tokens (Obsidian, Grafite, Dourado, Roxo)
│   ├── main.tsx                      # Bootstrap React
│   ├── db/                           # Camada Drizzle ORM + Cloud SQL PostgreSQL
│   │   ├── drizzle.config.ts
│   │   ├── index.ts
│   │   ├── schema.ts                 # 14 entidades relacionais
│   │   ├── seed-catalog.ts           # Catálogo estrutural inicial (sem regras inventadas)
│   │   └── users.ts                  # Repositório de usuários + hash scrypt
│   ├── lib/
│   │   ├── firebase.ts               # SDK Firebase Client
│   │   └── firebase-admin.ts         # SDK Firebase Admin
│   └── modules/                      # Módulos de domínio do Frontend
│       ├── admin/AdminView.tsx
│       ├── auth/AuthContext.tsx
│       ├── contests/HistoryView.tsx
│       ├── lotteries/LotteriesView.tsx
│       ├── probabilities/
│       │   ├── MathLabView.tsx
│       │   └── combinatorics.ts
│       ├── ui/
│       │   ├── LotusLogo.tsx
│       │   ├── OfflineIndicator.tsx
│       │   ├── OverviewDashboard.tsx
│       │   ├── PWAInstallButton.tsx
│       │   ├── PlannedModuleView.tsx
│       │   └── usePWAInstall.ts
│       └── users/AccountView.tsx
└── tests/                            # Testes automatizados Vitest (contratos, combinatória, segurança)
    └── foundation.test.ts
```
