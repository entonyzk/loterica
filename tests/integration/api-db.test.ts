import http from 'node:http';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server.ts';
import { db, hasDatabaseCredentials } from '../../src/db/index.ts';
import { auditLogs, lotteryRuleVersions, lotteryTypes, users } from '../../src/db/schema.ts';
import { adminAuth } from '../../src/lib/firebase-admin.ts';

describe('Integração — PostgreSQL (Cloud SQL / TEST_SQL_*) e Autenticação Firebase + RBAC', () => {
  let server: http.Server;
  let baseUrl = '';
  const createdTestUids: string[] = [];
  const createdTestLotteryIds: number[] = [];

  beforeAll(async () => {
    if (!hasDatabaseCredentials()) {
      throw new Error(
        'Credenciais PostgreSQL ausentes (configure SQL_* ou TEST_SQL_* para NODE_ENV=test) para executar a suíte de integração.'
      );
    }

    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const lid of createdTestLotteryIds) {
      await db.delete(lotteryTypes).where(eq(lotteryTypes.id, lid)).catch(() => undefined);
    }
    for (const uid of createdTestUids) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUid, uid)).catch(() => undefined);
      await db.delete(users).where(eq(users.uid, uid)).catch(() => undefined);
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('consulta catálogo de modalidades e concursos no PostgreSQL sem regras/resultados inventados', async () => {
    const lotRes = await fetch(`${baseUrl}/api/lotteries`);
    expect(lotRes.status).toBe(200);
    const lotData = await lotRes.json();
    expect(lotData.rulesVerified).toBe(false);
    expect(lotData.total).toBeGreaterThanOrEqual(8);

    const detailRes = await fetch(`${baseUrl}/api/lotteries/mega-sena`);
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.code).toBe('mega-sena');
    expect(Array.isArray(detailJson.ruleVersions)).toBe(true);

    const notFound = await fetch(`${baseUrl}/api/lotteries/999999`);
    expect(notFound.status).toBe(404);

    const badContestQuery = await fetch(`${baseUrl}/api/contests?limit=9999`);
    expect(badContestQuery.status).toBe(400);

    const contestsRes = await fetch(`${baseUrl}/api/contests`);
    expect(contestsRes.status).toBe(200);
    const contestsJson = await contestsRes.json();
    expect(contestsJson.hasVerifiedSourceData).toBe(false);
  });

  it('valida regras verificadas no PostgreSQL para cálculos por modalidade e bloqueia parâmetros arbitrários', async () => {
    // 1. Modalidade da Etapa 1 sem regra verificada (mega-sena) rejeita cálculo por modalidade com 409
    const awaitingRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryCode: 'mega-sena',
        universeSize: 60,
        drawnCount: 6,
        chosenCount: 6,
      }),
    });
    expect(awaitingRes.status).toBe(409);
    expect((await awaitingRes.json()).error).toBe('MODALITY_AWAITING_CONFIGURATION');

    // 2. Modo Parâmetros Livres continua operando independentemente do catálogo
    const freeRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'free',
        lotteryCode: 'generic-reference',
        universeSize: 20,
        drawnCount: 4,
        chosenCount: 4,
      }),
    });
    expect(freeRes.status).toBe(200);
    expect((await freeRes.json()).modalityContext.mode).toBe('free');

    // 3. Cria modalidade e versão de regra verificada temporária no banco para validar vínculo estrito
    const testCode = `homolog-ref-${Date.now()}`;
    const [insertedLottery] = await db
      .insert(lotteryTypes)
      .values({
        name: 'Modalidade Teste Homologação',
        code: testCode,
        description: 'Registro temporário isolado de teste de integração.',
        status: 'active',
      })
      .returning();

    createdTestLotteryIds.push(insertedLottery.id);

    const [insertedRule] = await db
      .insert(lotteryRuleVersions)
      .values({
        lotteryTypeId: insertedLottery.id,
        versionNumber: 1,
        minNumbersToChoose: 5,
        maxNumbersToChoose: 7,
        numberUniverseMin: 1,
        numberUniverseMax: 25,
        drawnNumbersCount: 5,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        officialSource: 'Fonte de Homologação Automatizada',
        isVerified: true,
        isLocked: false,
      })
      .returning();

    // Parâmetros arbitrários rejeitados
    const wrongUniverse = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: insertedLottery.id,
        lotteryCode: testCode,
        ruleVersionId: insertedRule.id,
        universeSize: 30,
        drawnCount: 5,
        chosenCount: 5,
      }),
    });
    expect(wrongUniverse.status).toBe(400);
    expect((await wrongUniverse.json()).error).toBe('MODALITY_PARAMETER_MISMATCH');

    // Execução válida com todos os identificadores e limites oficiais verificados
    const validRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: insertedLottery.id,
        lotteryCode: testCode,
        ruleVersionId: insertedRule.id,
        universeSize: 25,
        drawnCount: 5,
        chosenCount: 6,
      }),
    });
    expect(validRes.status).toBe(200);
    const validJson = await validRes.json();
    expect(validJson.totalCombinations).toBe('177100'); // C(25, 6)
    expect(validJson.modalityContext).toMatchObject({
      mode: 'modality',
      lotteryId: insertedLottery.id,
      lotteryCode: testCode,
      ruleVersionId: insertedRule.id,
      ruleVersionNumber: 1,
      isVerified: true,
    });
  });

  it('valida autenticação Firebase, RBAC administrativo e isolamento estrito entre contas no banco', async () => {
    expect((await fetch(`${baseUrl}/api/users/profile`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/admin/data-sources`)).status).toBe(401);

    const verifySpy = vi.spyOn(adminAuth, 'verifyIdToken');
    verifySpy.mockRejectedValueOnce(new Error('invalid-jwt'));
    const badAuth = await fetch(`${baseUrl}/api/users/profile`, {
      headers: { Authorization: 'Bearer fake-token' },
    });
    expect(badAuth.status).toBe(401);

    const uidUser = `test-user-${Date.now()}`;
    createdTestUids.push(uidUser);
    verifySpy.mockResolvedValue({
      uid: uidUser,
      email: `${uidUser}@lotus.test`,
      email_verified: true,
      name: 'Usuário Integração',
    } as never);

    const profileRes = await fetch(`${baseUrl}/api/users/profile`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(profileRes.status).toBe(200);
    const profileJson = await profileRes.json();
    expect(profileJson.profile.role).toBe('user');
    const userId = profileJson.profile.id as number;

    // Isolamento de contas
    const otherUserRes = await fetch(`${baseUrl}/api/users/${userId + 1}/profile`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(otherUserRes.status).toBe(403);

    // Bloqueio de escalação de privilégio
    const escalateRes = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid-user-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacker', role: 'super_admin' }),
    });
    expect(escalateRes.status).toBe(400);

    // Atualização legítima
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

    // RBAC
    const forbiddenAdmin = await fetch(`${baseUrl}/api/admin/data-sources`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(forbiddenAdmin.status).toBe(403);

    await db.update(users).set({ role: 'admin' }).where(eq(users.uid, uidUser));
    const adminOk = await fetch(`${baseUrl}/api/admin/data-sources`, {
      headers: { Authorization: 'Bearer valid-user-token' },
    });
    expect(adminOk.status).toBe(200);
    const adminData = await adminOk.json();
    expect(adminData.total).toBeGreaterThanOrEqual(2);
  });
});
