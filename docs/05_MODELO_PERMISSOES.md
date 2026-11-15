# 05. Modelo de Permissões (RBAC)

O controle de acesso do **LOTUS AI** combina autenticação via Firebase Authentication (`uid` verificado no backend por `firebase-admin`) com papéis armazenados na coluna `users.role` do PostgreSQL.

## Perfis Definidos

| Papel (`role`) | Descrição |
| :--- | :--- |
| `user` | Usuário padrão autenticado (papel inicial atribuído no primeiro login) |
| `analyst` | Usuário com acesso avançado ao Laboratório Matemático, Simulador e Backtesting |
| `admin` | Administrador operacional responsável por modalidades, fontes oficiais e auditoria |
| `super_admin` | Administrador principal com gestão de papéis e configurações globais |

## Matriz de Autorização

| Recurso / Operação | Visitante | `user` | `analyst` | `admin` | `super_admin` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Consultar `/api/lotteries` e `/api/contests` | Sim | Sim | Sim | Sim | Sim |
| Consultar `/api/docs/openapi.json` e `/api/health` | Sim | Sim | Sim | Sim | Sim |
| Consultar e atualizar próprio `/api/users/profile` | Não | Sim | Sim | Sim | Sim |
| Executar análises e simulações próprias (Etapas 3–4) | Não | Sim | Sim | Sim | Sim |
| Executar backtests em lote (Etapa 5) | Não | Limitado | Sim | Sim | Sim |
| Gerenciar `data_sources` e `lottery_rule_versions` | Não | Não | Não | Sim | Sim |
| Consultar `audit_logs` | Não | Não | Não | Sim | Sim |
| Alterar `role` e `status` de outros usuários | Não | Não | Não | Não | Sim |

## Proteções de Isolamento
- Todas as queries de dados privados (`analysis_history`, `simulations`, `user_bets`) filtram obrigatoriamente pelo `id` do usuário autenticado extraído do token JWT verificado no servidor (`req.dbUser.id`), nunca confiando em IDs enviados pelo cliente.
- Contas com `status = 'suspended'` são bloqueadas automaticamente no middleware `requireAuth` com código `403 ACCOUNT_SUSPENDED`.
