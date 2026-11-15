import http from 'node:http';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.ts';
import {
  computeLocalTheoreticalDistribution,
  exactCombinationsBigInt,
  hypergeometricDetail,
  hypergeometricProbability,
} from '../server/modules/math-bridge/client.ts';
import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';
import { hashPassword, verifyPassword } from '../src/db/users.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';

describe('1 & 2. Combinatória Exata, Distribuição Hipergeométrica e Precisão', () => {
  it('calcula referências combinatórias exatas: Mega-Sena, Lotofácil e Quina', () => {
    // Mega-Sena: C(60, 6) = 50.063.860
    expect(exactCombinationsBigInt(60, 6)).toBe(50_063_860n);
    // Lotofácil: C(25, 15) = 3.268.760
    expect(exactCombinationsBigInt(25, 15)).toBe(3_268_760n);
    // Quina: C(80, 5) = 24.040.016
    expect(exactCombinationsBigInt(80, 5)).toBe(24_040_016n);
  });

  it('garante que a distribuição hipergeométrica completa soma 1.0 para Mega-Sena, Lotofácil e Quina', () => {
    const cases = [
      { name: 'Mega-Sena (60, 6, 6)', n: 60, k: 6, m: 6 },
      { name: 'Lotofácil (25, 15, 15)', n: 25, k: 15, m: 15 },
      { name: 'Quina (80, 5, 5)', n: 80, k: 5, m: 5 },
    ];

    for (const c of cases) {
      const result = computeLocalTheoreticalDistribution(c.n, c.k, c.m);
      const sum = result.distribution.reduce((acc, item) => acc + item.probability, 0);
      expect(sum, `Soma para ${c.name}`).toBeCloseTo(1.0, 12);
    }
  });

  it('preserva probabilidades muito pequenas sem truncamento silencioso para zero', () => {
    // C(100, 20) = 535.983.370.403.809.682.970 (~5.3598e20) -> P(X=20) ~ 1.8657e-21
    const detail = hypergeometricDetail(100, 20, 20, 20);
    expect(detail.isImpossible).toBe(false);
    expect(detail.exactNumerator).toBe('1');
    expect(detail.exactDenominator).toBe('535983370403809682970');
    expect(detail.probability).toBeGreaterThan(0);
    expect(detail.probability).toBeCloseTo(1 / 535983370403809682970, 30);
    expect(detail.scientificNotation.startsWith('1.8657')).toBe(true);
    expect(detail.precisionClassification).toBe('exact_rational_with_float_approximation');
  });

  it('representa eventos matematicamente impossíveis como zero exato', () => {
    // Em Lotofácil (N=25, k=15, m=15), é impossível acertar menos que 5 números (pois só 10 ficam fora)
    const impossibleLow = hypergeometricDetail(25, 15, 15, 4);
    expect(impossibleLow.isImpossible).toBe(true);
    expect(impossibleLow.probability).toBe(0);
    expect(impossibleLow.exactNumerator).toBe('0');
    expect(impossibleLow.precisionClassification).toBe('exact');

    // Acertar mais que o sorteado (h=7 em k=6)
    const impossibleHigh = hypergeometricDetail(60, 6, 6, 7);
    expect(impossibleHigh.isImpossible).toBe(true);
    expect(impossibleHigh.probability).toBe(0);
  });

  it('rejeita parâmetros inválidos (floats, NaN, negativos, fora do universo)', () => {
    expect(() => exactCombinationsBigInt(60.5, 6)).toThrow();
    expect(() => exactCombinationsBigInt(Number.NaN, 6)).toThrow();
    expect(() => exactCombinationsBigInt(5, 8)).toThrow();
    expect(() => exactCombinationsBigInt(0, 0)).toThrow();
    expect(() => hypergeometricProbability(60, 61, 6, 6)).toThrow();
    expect(() => hypergeometricProbability(60, 6, -1, 0)).toThrow();
  });
});

describe('3. Segurança de Credenciais (Hash scrypt)', () => {
  it('gera hashes scrypt distintos com salt aleatório e valida em tempo constante', () => {
    const hashA = hashPassword('SenhaSegura#2026');
    const hashB = hashPassword('SenhaSegura#2026');

    expect(hashA).not.toBe(hashB);
    expect(hashA.includes('SenhaSegura#2026')).toBe(false);
    expect(verifyPassword('SenhaSegura#2026', hashA)).toBe(true);
    expect(verifyPassword('SenhaIncorreta', hashA)).toBe(false);
    expect(() => hashPassword('curta')).toThrow();
  });
});

describe('4. Contratos REST, Segurança, RBAC, Isolamento e Comunicação Node/Python', () => {
  let server: http.Server;
  let baseUrl = '';
  const createdTestUids: string[] = [];

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const uid of createdTestUids) {
      await db.delete(users).where(eq(users.uid, uid)).catch(() => undefined);
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('GET /api/health e Helmet CSP respondem com segurança sem expor segredos', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("object-src 'none'");

    const rawText = await res.text();
    expect(rawText).not.toContain('SQL_PASSWORD');
    expect(rawText).not.toContain('GEMINI_API_KEY');
    const json = JSON.parse(rawText);
    expect(json.service).toBe('lotus-ai-api');
    expect(json.aiLayer.isolatedFromMathCalculations).toBe(true);
  });

  it('Proteção CORS aceita origem autorizada e bloqueia origem externa maliciosa', async () => {
    const allowedRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');

    const forbiddenRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil-attacker.example.com' },
    });
    expect(forbiddenRes.status).toBe(403);
    const errJson = await forbiddenRes.json();
    expect(errJson.error).toBe('CORS_ORIGIN_FORBIDDEN');
  });

  it('CORS em modo produção exige CORS_ORIGIN / APP_URL explícitos', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://lotusai.app';

    const prodApp = createApp();
    let prodServer: http.Server | undefined;
    try {
      const prodUrl = await new Promise<string>((resolve) => {
        prodServer = prodApp.listen(0, '127.0.0.1', () => {
          const addr = prodServer!.address();
          resolve(`http://127.0.0.1:${(addr as { port: number }).port}`);
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
      process.env.NODE_ENV = prevEnv;
      process.env.CORS_ORIGIN = prevCors;
      if (prodServer) {
        await new Promise<void>((r) => prodServer!.close(() => r()));
      }
    }
  });

  it('Validação das APIs: OpenAPI, PostgreSQL lotteries/contests, 400, 404 e 501', async () => {
    const specRes = await fetch(`${baseUrl}/api/docs/openapi.json`);
    expect(specRes.status).toBe(200);
    const spec = await specRes.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/lotteries'].get['x-lotus-status']).toBe('implemented');
    expect(spec.paths['/api/math/python/theoretical'].post['x-lotus-status']).toBe('implemented');
    expect(spec.paths['/api/simulations'].post['x-lotus-status']).toBe('planned');

    const lotRes = await fetch(`${baseUrl}/api/lotteries`);
    expect(lotRes.status).toBe(200);
    const lotData = await lotRes.json();
    expect(lotData.rulesVerified).toBe(false);
    expect(lotData.total).toBeGreaterThanOrEqual(8);

    const notFound = await fetch(`${baseUrl}/api/lotteries/999999`);
    expect(notFound.status).toBe(404);

    const badContestQuery = await fetch(`${baseUrl}/api/contests?limit=9999`);
    expect(badContestQuery.status).toBe(400);

    const badMathBody = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universeSize: 10, drawnCount: 15, chosenCount: 5 }),
    });
    expect(badMathBody.status).toBe(400);

    const plannedSim = await fetch(`${baseUrl}/api/simulations`, { method: 'POST' });
    expect(plannedSim.status).toBe(501);
  });

  it('Autenticação Firebase, RBAC administrativo e isolamento estrito entre contas', async () => {
    // 1. Sem token -> 401
    expect((await fetch(`${baseUrl}/api/users/profile`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/admin/data-sources`)).status).toBe(401);

    // 2. Token inválido -> 401
    const verifySpy = vi.spyOn(adminAuth, 'verifyIdToken');
    verifySpy.mockRejectedValueOnce(new Error('invalid-jwt'));
    const badAuth = await fetch(`${baseUrl}/api/users/profile`, {
      headers: { Authorization: 'Bearer fake-token' },
    });
    expect(badAuth.status).toBe(401);

    // 3. Usuário padrão autenticado -> sincroniza no PostgreSQL com role 'user'
    const uidUser = `test-user-${Date.now()}`;
    createdTestUids.push(uidUser);
    verifySpy.mockResolvedValue({
      uid: uidUser,
      email: `${uidUser}@lotus.test`,
      email_verified: true,
      name: 'Usuário Teste',
    } as never);

    const profileRes = await fetch(`${baseUrl}/api/users/profile`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(profileRes.status).toBe(200);
    const profileJson = await profileRes.json();
    expect(profileJson.profile.role).toBe('user');
    const userId = profileJson.profile.id as number;

    // 4. Isolamento entre contas: usuário não acessa ID de outro usuário (403)
    const otherUserRes = await fetch(`${baseUrl}/api/users/${userId + 1}/profile`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(otherUserRes.status).toBe(403);

    // 5. Tentativa de escalar privilégio via PATCH /api/users/profile é bloqueada (400 strict schema)
    const escalateRes = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid-user-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacker', role: 'super_admin' }),
    });
    expect(escalateRes.status).toBe(400);

    // 6. Atualização legítima do próprio nome funciona
    const patchOk = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid-user-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Usuário Atualizado' }),
    });
    expect(patchOk.status).toBe(200);
    expect((await patchOk.json()).profile.name).toBe('Usuário Atualizado');

    // 7. RBAC: usuário comum bloqueado no painel administrativo (403)
    const forbiddenAdmin = await fetch(`${baseUrl}/api/admin/data-sources`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(forbiddenAdmin.status).toBe(403);

    // 8. Usuário promovido a admin no banco acessa /api/admin/data-sources (200)
    await db.update(users).set({ role: 'admin' }).where(eq(users.uid, uidUser));
    const adminOk = await fetch(`${baseUrl}/api/admin/data-sources`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(adminOk.status).toBe(200);
    const adminData = await adminOk.json();
    expect(adminData.total).toBeGreaterThanOrEqual(2);
  });

  it('Comunicação HTTP Node.js/Python: sucesso validado, timeout (504), indisponibilidade (503) e payload inválido (502)', async () => {
    const prevUrl = process.env.MATH_ENGINE_URL;
    const prevTimeout = process.env.MATH_ENGINE_TIMEOUT_MS;

    let stubMode: 'ok' | 'slow' | 'bad_json' = 'ok';
    const pythonStub = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ready',
            service: 'lotus-math-engine',
            execution_source: 'python_fastapi_engine',
          })
        );
        return;
      }
      if (req.url === '/v1/probabilities/theoretical' && req.method === 'POST') {
        if (stubMode === 'slow') {
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(200);
              res.end('{}');
            }
          }, 500);
          return;
        }
        if (stubMode === 'bad_json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ invalid_contract: true }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            lottery_code: 'mega-sena',
            total_combinations: '50063860',
            distribution_by_hits: {
              '6': {
                hits: 6,
                probability: 1 / 50063860,
                exact_numerator: '1',
                exact_denominator: '50063860',
                scientific_notation: '1.9974489E-08',
                is_impossible: false,
                precision_classification: 'exact_rational_with_float_approximation',
              },
            },
            axiom_notice: 'Independência verificada',
            execution_source: 'python_fastapi_engine',
            engine_status: 'verified_combinatorics',
          })
        );
      }
    });

    try {
      const stubUrl = await new Promise<string>((resolve) => {
        pythonStub.listen(0, '127.0.0.1', () => {
          const addr = pythonStub.address() as { port: number };
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      });

      process.env.MATH_ENGINE_URL = stubUrl;
      process.env.MATH_ENGINE_TIMEOUT_MS = '150';

      // A. Sucesso validado
      stubMode = 'ok';
      const healthRes = await fetch(`${baseUrl}/api/math/python/health`);
      expect(healthRes.status).toBe(200);

      const okRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        }),
      });
      expect(okRes.status).toBe(200);
      const okJson = await okRes.json();
      expect(okJson.execution_source).toBe('python_fastapi_engine');
      expect(okJson.total_combinations).toBe('50063860');

      // B. Timeout explícito -> 504 (nunca retorna cálculo local como se fosse Python)
      stubMode = 'slow';
      const timeoutRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        }),
      });
      expect(timeoutRes.status).toBe(504);
      expect((await timeoutRes.json()).error).toBe('MATH_ENGINE_TIMEOUT');

      // C. Resposta fora do contrato -> 502
      stubMode = 'bad_json';
      const badRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        }),
      });
      expect(badRes.status).toBe(502);
      expect((await badRes.json()).error).toBe('MATH_ENGINE_INVALID_RESPONSE');

      // D. Serviço indisponível -> 503
      await new Promise<void>((r) => pythonStub.close(() => r()));
      const downRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        }),
      });
      expect(downRes.status).toBe(503);
      expect((await downRes.json()).error).toBe('MATH_ENGINE_UNAVAILABLE');
    } finally {
      process.env.MATH_ENGINE_URL = prevUrl;
      process.env.MATH_ENGINE_TIMEOUT_MS = prevTimeout;
      if (pythonStub.listening) {
        await new Promise<void>((r) => pythonStub.close(() => r()));
      }
    }
  });
});
