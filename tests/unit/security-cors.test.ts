import http from 'node:http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { describe, expect, it } from 'vitest';
import {
  CorsForbiddenError,
  buildCorsOptionsDelegate,
  buildHelmetOptions,
} from '../../server/config/security.ts';
import { mathRouter } from '../../server/modules/math-bridge/router.ts';
import { buildOpenApiSpec } from '../../server/openapi.ts';

function createSecurityTestApp(isProd: boolean) {
  const app = express();
  app.use(helmet(buildHelmetOptions(isProd)));
  app.use(cors(buildCorsOptionsDelegate(isProd)));
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'operational',
      service: 'lotus-ai-api',
      aiLayer: { isolatedFromMathCalculations: true },
    });
  });
  app.get('/api/docs/openapi.json', (_req, res) => res.json(buildOpenApiSpec()));
  app.use('/api/math', mathRouter);
  app.post('/api/simulations', (_req, res) =>
    res.status(501).json({ error: 'NOT_IMPLEMENTED', stageTarget: 'etapa-4' })
  );
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof CorsForbiddenError) {
        return res.status(err.statusCode).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  );
  return app;
}

describe('Unitários — Segurança HTTP, Helmet CSP, CORS e OpenAPI', () => {
  it('aplica Helmet CSP compatível com AI Studio iframe e bloqueia origens externas via CORS', async () => {
    const devApp = createSecurityTestApp(false);
    let server: http.Server | undefined;
    try {
      const baseUrl = await new Promise<string>((resolve) => {
        server = devApp.listen(0, '127.0.0.1', () => {
          const addr = server!.address() as { port: number };
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      });

      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);
      const csp = health.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain('https://aistudio.google.com');
      expect(health.headers.get('x-frame-options')).toBeNull();

      const allowedCors = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(allowedCors.status).toBe(200);
      expect(allowedCors.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:3000'
      );

      const forbiddenCors = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil-attacker.example.com' },
      });
      expect(forbiddenCors.status).toBe(403);
      expect((await forbiddenCors.json()).error).toBe('CORS_ORIGIN_FORBIDDEN');

      // OpenAPI 3.1 + validação Zod + 501 em rota planejada
      const specRes = await fetch(`${baseUrl}/api/docs/openapi.json`);
      const spec = await specRes.json();
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.paths['/api/math/python/theoretical'].post['x-lotus-status']).toBe(
        'implemented'
      );

      const badMath = await fetch(`${baseUrl}/api/math/local/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universeSize: 10, drawnCount: 15, chosenCount: 5 }),
      });
      expect(badMath.status).toBe(400);

      const planned = await fetch(`${baseUrl}/api/simulations`, { method: 'POST' });
      expect(planned.status).toBe(501);
    } finally {
      if (server) {
        await new Promise<void>((r) => server!.close(() => r()));
      }
    }
  });

  it('exige origens explícitas em modo produção (CORS)', async () => {
    const prevCors = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://lotusai.app';
    const prodApp = createSecurityTestApp(true);
    let server: http.Server | undefined;
    try {
      const prodUrl = await new Promise<string>((resolve) => {
        server = prodApp.listen(0, '127.0.0.1', () => {
          const addr = server!.address() as { port: number };
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      });

      const okRes = await fetch(`${prodUrl}/api/health`, {
        headers: { Origin: 'https://lotusai.app' },
      });
      expect(okRes.status).toBe(200);

      const blockedLocal = await fetch(`${prodUrl}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(blockedLocal.status).toBe(403);
    } finally {
      process.env.CORS_ORIGIN = prevCors;
      if (server) {
        await new Promise<void>((r) => server!.close(() => r()));
      }
    }
  });
});
