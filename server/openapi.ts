import {
  MATHEMATICAL_INDEPENDENCE_AXIOM,
  getMathEngineArchitectureStatus,
} from './modules/math-bridge/client.ts';
import { isGeminiConfigured } from './modules/ai/gemini-service.ts';

export function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LOTUS AI REST API',
      version: '2.0.0-stage2',
      description:
        'Contratos REST da plataforma LOTUS AI (Etapa 2 — Motor Matemático Especializado). Rotas implementadas e rotas planejadas para etapas futuras estão explicitamente distinguidas via `x-lotus-status`.',
    },
    servers: [
      {
        url: '/',
        description: 'Servidor unificado (Web + PWA + Capacitor Android)',
      },
    ],
    components: {
      securitySchemes: {
        BearerFirebaseJWT: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Firebase Authentication ID Token enviado no cabeçalho Authorization: Bearer <token>.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error', 'message'],
          properties: {
            error: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        PlannedResponse: {
          type: 'object',
          required: ['error', 'status', 'targetStage'],
          properties: {
            error: { type: 'string', example: 'NOT_IMPLEMENTED' },
            status: { type: 'string', example: 'planned' },
            targetStage: { type: 'string', example: 'Etapa 2+' },
            message: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Verificação de saúde e arquitetura da fundação',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Estado estrutural da plataforma e fronteiras de serviços' },
          },
        },
      },
      '/api/docs/openapi.json': {
        get: {
          summary: 'Especificação OpenAPI 3.1 da plataforma',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Documento OpenAPI JSON' },
          },
        },
      },
      '/api/lotteries': {
        get: {
          summary: 'Lista o catálogo de modalidades configuráveis e eventos especiais vinculados',
          'x-lotus-status': 'implemented',
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['awaiting_rules', 'configured', 'active', 'archived'],
              },
            },
          ],
          responses: {
            '200': { description: 'Catálogo de modalidades' },
            '400': { description: 'Parâmetro de filtro inválido' },
          },
        },
      },
      '/api/lotteries/{id}': {
        get: {
          summary: 'Detalhes de uma modalidade por ID numérico ou código slug',
          'x-lotus-status': 'implemented',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'referenceDate',
              in: 'query',
              required: false,
              description:
                'Data ISO-8601 opcional para resolver qual versão de regra verificada estava vigente na data histórica.',
              schema: { type: 'string', format: 'date-time' },
            },
          ],
          responses: {
            '200': { description: 'Detalhes da modalidade, versões de regras, vigência temporal e eventos especiais' },
            '400': { description: 'Parâmetro referenceDate inválido' },
            '404': { description: 'Modalidade não encontrada' },
          },
        },
      },
      '/api/contests': {
        get: {
          summary: 'Consulta concursos oficiais verificados (vazio até ingestão na Etapa 2)',
          'x-lotus-status': 'implemented',
          parameters: [
            { name: 'lotteryId', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          ],
          responses: {
            '200': { description: 'Lista de concursos verificados' },
            '400': { description: 'Parâmetros inválidos' },
          },
        },
      },
      '/api/contests/{id}': {
        get: {
          summary: 'Detalhes de um concurso específico, dezenas sorteadas e faixas de premiação',
          'x-lotus-status': 'implemented',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '200': { description: 'Concurso detalhado' },
            '404': { description: 'Concurso não encontrado' },
          },
        },
      },
      '/api/math/local/theoretical': {
        post: {
          summary: 'Distribuição hipergeométrica teórica exata via cálculo local BigInt (Node.js)',
          description:
            'Aceita modo free (Parâmetros Livres) ou modality (com validação de regra verificada e vigência temporal via referenceDate, contestId ou contestNumber).',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Distribuição racional exata, contexto temporal e aproximação IEEE-754' },
            '400': { description: 'Parâmetros combinatórios, referência temporal ou vínculo de modalidade inválidos' },
            '404': { description: 'Modalidade, concurso ou versão de regra não encontrada' },
            '409': {
              description:
                'Modalidade aguardando configuração de regras verificadas ou versão de regra fora de vigência (futura/expirada) para a data de referência',
            },
          },
        },
      },
      '/api/math/python/health': {
        get: {
          summary: 'Verifica disponibilidade HTTP real do microsserviço Python FastAPI',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Serviço Python acessível' },
            '503': { description: 'Serviço Python indisponível ou não configurado' },
            '504': { description: 'Timeout de comunicação com serviço Python' },
          },
        },
      },
      '/api/math/python/theoretical': {
        post: {
          summary: 'Executa cálculo teórico diretamente no microsserviço Python FastAPI',
          description:
            'Valida modalidade, vigência temporal [validFrom, validTo) e integridade matemática rigorosa da resposta Python.',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Resultado validado do motor Python com contexto temporal' },
            '400': { description: 'Parâmetros combinatórios, referência temporal ou vínculo de modalidade inválidos' },
            '404': { description: 'Modalidade, concurso ou versão de regra não encontrada' },
            '409': {
              description:
                'Modalidade aguardando configuração de regras verificadas ou versão de regra fora de vigência (futura/expirada) para a data de referência',
            },
            '502': { description: 'Resposta inválida ou inconsistente do motor Python' },
            '503': { description: 'Motor Python indisponível' },
            '504': { description: 'Timeout do motor Python' },
          },
        },
      },
      '/api/math/local/specialized': {
        post: {
          summary: 'Cálculo especializado completo por modalidade (Mega-Sena, Lotofácil) em BigInt exato',
          description:
            'Calcula faixas oficiais de premiação, probabilidade de premiar vs. não premiar, apostas simples vs. múltiplas com custo verificado, desdobramento e memória de cálculo.',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Análise matemática especializada completa' },
            '400': { description: 'Parâmetros inválidos ou fora dos limites da modalidade' },
            '404': { description: 'Modalidade ou concurso não encontrado' },
            '409': { description: 'Modalidade aguardando configuração ou regra fora de vigência' },
          },
        },
      },
      '/api/math/python/specialized': {
        post: {
          summary: 'Executa cálculo especializado por modalidade no microsserviço Python FastAPI',
          'x-lotus-status': 'implemented',
          responses: {
            '200': { description: 'Resultado especializado validado do motor Python' },
            '400': { description: 'Parâmetros inválidos' },
            '404': { description: 'Modalidade não encontrada' },
            '409': { description: 'Modalidade sem regra vigente verificada' },
            '501': { description: 'Modelo estrutural preparado aguardando ativação' },
            '502': { description: 'Divergência matemática ou contrato inválido do motor Python' },
            '503': { description: 'Motor Python indisponível' },
            '504': { description: 'Timeout do motor Python' },
          },
        },
      },
      '/api/users/profile': {
        get: {
          summary: 'Perfil autenticado do usuário sincronizado com PostgreSQL',
          'x-lotus-status': 'implemented',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '200': { description: 'Perfil do usuário e resumo de atividade' },
            '401': { description: 'Token ausente ou inválido' },
          },
        },
        patch: {
          summary: 'Atualiza o nome do próprio perfil autenticado',
          'x-lotus-status': 'implemented',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '200': { description: 'Perfil atualizado' },
            '400': { description: 'Corpo inválido' },
            '401': { description: 'Token ausente ou inválido' },
          },
        },
      },
      '/api/users/{userId}/profile': {
        get: {
          summary: 'Consulta perfil por ID com bloqueio de isolamento entre contas',
          'x-lotus-status': 'implemented',
          security: [{ BearerFirebaseJWT: [] }],
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '200': { description: 'Perfil próprio' },
            '403': { description: 'Acesso negado a dados de outra conta' },
          },
        },
      },
      '/api/admin/data-sources': {
        get: {
          summary: 'Lista fontes de dados oficiais registradas (somente Admin/Super Admin)',
          'x-lotus-status': 'implemented',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '200': { description: 'Fontes registradas e status de validação' },
            '401': { description: 'Não autenticado' },
            '403': { description: 'Acesso negado (RBAC)' },
          },
        },
      },
      '/api/admin/audit-logs': {
        get: {
          summary: 'Consulta trilha de auditoria administrativa',
          'x-lotus-status': 'implemented',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '200': { description: 'Últimos registros de auditoria' },
            '401': { description: 'Não autenticado' },
            '403': { description: 'Acesso negado (RBAC)' },
          },
        },
      },
      '/api/statistics/{lotteryId}': {
        get: {
          summary: 'Estatísticas descritivas históricas (Planejado — Etapa 3)',
          'x-lotus-status': 'planned',
          parameters: [{ name: 'lotteryId', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '501': { description: 'Endpoint planejado para Etapa 3 após ingestão histórica na Etapa 2' },
          },
        },
      },
      '/api/simulations': {
        post: {
          summary: 'Submissão de simulação Monte Carlo com semente reproduzível (Planejado — Etapa 4)',
          'x-lotus-status': 'planned',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '501': { description: 'Endpoint planejado para Etapa 4' },
          },
        },
      },
      '/api/analyses': {
        post: {
          summary: 'Execução de análise probabilística e registro em histórico (Planejado — Etapa 3)',
          'x-lotus-status': 'planned',
          security: [{ BearerFirebaseJWT: [] }],
          responses: {
            '501': { description: 'Endpoint planejado para Etapa 3' },
          },
        },
      },
    },
    'x-lotus-architecture': {
      stage: 'Etapa 2',
      axiom: MATHEMATICAL_INDEPENDENCE_AXIOM,
      mathEngine: getMathEngineArchitectureStatus(),
      geminiConfigured: isGeminiConfigured(),
    },
  };
}
