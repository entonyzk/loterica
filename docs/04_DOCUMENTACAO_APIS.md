# 04. Documentação das APIs e Contratos REST

A especificação **OpenAPI 3.1** completa e viva pode ser obtida diretamente no servidor em:
`GET /api/docs/openapi.json`

## Autenticação e Cabeçalhos
Rotas privadas exigem token JWT emitido pelo Firebase Authentication:
```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

## Padrão de Erros
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Parâmetros de consulta inválidos.",
  "details": [{ "path": "limit", "message": "Expected number" }]
}
```
Códigos padronizados: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED / INVALID_TOKEN`, `403 FORBIDDEN / ACCOUNT_SUSPENDED`, `404 NOT_FOUND`, `429 RATE_LIMIT_EXCEEDED`, `500 DATABASE_ERROR`, `501 NOT_IMPLEMENTED` (para contratos planejados).

## Endpoints Implementados e Testados (Etapa 1)

| Método | Rota | Autenticação | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Pública | Status da API, axioma matemático e fronteiras do motor Python/Gemini |
| `GET` | `/api/docs/openapi.json` | Pública | Documento OpenAPI 3.1 completo |
| `GET` | `/api/lotteries` | Pública | Lista modalidades cadastradas no PostgreSQL e eventos especiais vinculados (filtro opcional `?status=`) |
| `GET` | `/api/lotteries/:id` | Pública | Detalhes de modalidade por ID numérico ou slug (`mega-sena`, `lotofacil`, etc.) |
| `GET` | `/api/contests` | Pública | Lista concursos oficiais verificados (retorna vazio na Etapa 1 até ingestão na Etapa 2) |
| `GET` | `/api/contests/:id` | Pública | Detalhes de concurso, dezenas sorteadas e faixas de premiação |
| `GET` | `/api/users/profile` | Bearer JWT | Perfil sincronizado na tabela `users` e contadores de atividade |
| `GET` | `/api/admin/data-sources` | Bearer JWT + RBAC (`admin`, `super_admin`) | Lista fontes de dados oficiais e registra leitura em `audit_logs` |
| `GET` | `/api/admin/audit-logs` | Bearer JWT + RBAC (`admin`, `super_admin`) | Consulta os últimos 50 registros de auditoria |

## Endpoints Planejados (Retornam `501 NOT_IMPLEMENTED` na Etapa 1)

| Método | Rota | Etapa Prevista | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/statistics/:lotteryId` | Etapa 3 | Frequências históricas descritivas e testes estatísticos |
| `POST` | `/api/analyses` | Etapa 3 | Execução e persistência de análise probabilística |
| `POST` | `/api/simulations` | Etapa 4 | Submissão de simulação Monte Carlo com `randomSeed` |
