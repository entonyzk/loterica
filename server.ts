import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CorsForbiddenError,
  buildCorsOptionsDelegate,
  buildHelmetOptions,
} from './server/config/security.ts';
import { adminRouter } from './server/modules/admin/router.ts';
import { isGeminiConfigured } from './server/modules/ai/gemini-service.ts';
import { contestsRouter } from './server/modules/contests/router.ts';
import { lotteriesRouter } from './server/modules/lotteries/router.ts';
import {
  MATHEMATICAL_INDEPENDENCE_AXIOM,
  getMathEngineArchitectureStatus,
} from './server/modules/math-bridge/client.ts';
import { mathRouter } from './server/modules/math-bridge/router.ts';
import { usersRouter } from './server/modules/users/router.ts';
import { buildOpenApiSpec } from './server/openapi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Segurança HTTP e CSP compatível com React, Google Fonts, Firebase Auth, PWA e iframe do AI Studio
  app.use(helmet(buildHelmetOptions(isProd)));

  // Política CORS estrita (aceita same-origin e origens autorizadas em CORS_ORIGIN / APP_URL)
  app.use(cors(buildCorsOptionsDelegate(isProd)));

  app.use(express.json({ limit: '256kb' }));

  const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Muitas requisições em um curto intervalo. Tente novamente em instantes.',
    },
  });

  const sensitiveApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Limite de requisições para rotas sensíveis atingido. Aguarde antes de tentar novamente.',
    },
  });

  app.use('/api', generalApiLimiter);
  app.use('/api/admin', sensitiveApiLimiter);
  app.use('/api/users', sensitiveApiLimiter);

  // --- Rotas Implementadas (Etapa 1) ---
  app.get('/api/health', (_req, res) => {
    res.json({
      service: 'lotus-ai-api',
      status: 'operational',
      stage: 'Etapa 3 — Laboratório Avançado de Combinações',
      environment: isProd ? 'production' : 'development',
      database: 'postgresql-cloudsql',
      axiom: MATHEMATICAL_INDEPENDENCE_AXIOM,
      mathEngine: getMathEngineArchitectureStatus(),
      aiLayer: {
        provider: 'gemini',
        configured: isGeminiConfigured(),
        isolatedFromMathCalculations: true,
      },
    });
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  app.use('/api/lotteries', lotteriesRouter);
  app.use('/api/contests', contestsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/math', mathRouter);

  // --- Contratos Planejados (Etapas 2+) — Retornam 501 explícito, nunca resultados simulados ---
  const plannedHandler = (targetStage: string, description: string) => {
    return (_req: Request, res: Response) => {
      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        status: 'planned',
        targetStage,
        message: description,
      });
    };
  };

  app.get(
    '/api/statistics/:lotteryId',
    plannedHandler(
      'Etapa 3',
      'Módulo de estatísticas históricas planejado para a Etapa 3 após ingestão verificada na Etapa 2.'
    )
  );
  app.post(
    '/api/simulations',
    plannedHandler(
      'Etapa 4',
      'Motor de simulações Monte Carlo planejado para a Etapa 4.'
    )
  );
  app.post(
    '/api/analyses',
    plannedHandler(
      'Etapa 3',
      'Registro de análises probabilísticas planejado para a Etapa 3.'
    )
  );

  // 404 para rotas /api desconhecidas
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'ENDPOINT_NOT_FOUND',
      message: 'Rota de API não encontrada.',
    });
  });

  // Tratamento centralizado de erros (incluindo rejeição CORS) sem vazamento de stack trace
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CorsForbiddenError) {
      return res.status(403).json({
        error: err.code,
        message: err.message,
      });
    }

    console.error('Unhandled server error:', err);
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: isProd ? 'Erro interno do servidor.' : err.message,
    });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LOTUS AI server listening on http://0.0.0.0:${port}`);
  });
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start LOTUS AI server:', err);
    process.exit(1);
  });
}
