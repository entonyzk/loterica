import http from 'node:http';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server.ts';
import { db, hasDatabaseCredentials } from '../../src/db/index.ts';
import { auditLogs, contests, lotteryRuleVersions, lotteryTypes, users } from '../../src/db/schema.ts';
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
      await db.delete(contests).where(eq(contests.lotteryTypeId, lid)).catch(() => undefined);
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

  it('consulta catálogo de modalidades e concursos no PostgreSQL com Mega-Sena/Lotofácil verificadas e demais aguardando configuração', async () => {
    const lotRes = await fetch(`${baseUrl}/api/lotteries`);
    expect(lotRes.status).toBe(200);
    const lotData = await lotRes.json();
    expect(lotData.stage).toBe('etapa-2-motor-especializado');
    expect(lotData.rulesVerified).toBe(true);
    expect(lotData.total).toBeGreaterThanOrEqual(8);

    const megaItem = lotData.items.find((i: { code: string }) => i.code === 'mega-sena');
    const lotofacilItem = lotData.items.find((i: { code: string }) => i.code === 'lotofacil');
    const quinaItem = lotData.items.find((i: { code: string }) => i.code === 'quina');
    expect(megaItem.status).toBe('active');
    expect(megaItem.activeRuleSummary.simpleBetPriceCents).toBe(600);
    expect(lotofacilItem.status).toBe('active');
    expect(lotofacilItem.activeRuleSummary.simpleBetPriceCents).toBe(350);
    expect(quinaItem.status).toBe('awaiting_rules');
    expect(quinaItem.activeRuleSummary).toBeNull();

    const detailRes = await fetch(`${baseUrl}/api/lotteries/mega-sena`);
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.code).toBe('mega-sena');
    expect(detailJson.activeRuleVersionId).not.toBeNull();
    expect(Array.isArray(detailJson.ruleVersions)).toBe(true);
    expect(detailJson.ruleVersions.length).toBeGreaterThanOrEqual(2);

    // Data histórica em 2024 deve selecionar tarifa anterior (R$ 5,00 / R$ 3,00)
    const megaHistRes = await fetch(
      `${baseUrl}/api/lotteries/mega-sena?referenceDate=2024-06-01T12:00:00.000Z`
    );
    expect(megaHistRes.status).toBe(200);
    const megaHistJson = await megaHistRes.json();
    const megaActiveHist = megaHistJson.ruleVersions.find(
      (r: { id: number }) => r.id === megaHistJson.activeRuleVersionId
    );
    expect(megaActiveHist.simpleBetPriceCents).toBe(500);

    const notFound = await fetch(`${baseUrl}/api/lotteries/999999`);
    expect(notFound.status).toBe(404);

    const badContestQuery = await fetch(`${baseUrl}/api/contests?limit=9999`);
    expect(badContestQuery.status).toBe(400);

    const contestsRes = await fetch(`${baseUrl}/api/contests`);
    expect(contestsRes.status).toBe(200);
    const contestsJson = await contestsRes.json();
    expect(contestsJson.hasVerifiedSourceData).toBe(false);
  });

  it('valida regras verificadas no PostgreSQL para Mega-Sena, Lotofácil, modalidades aguardando configuração e parâmetros arbitrários', async () => {
    // 1. Modalidade ainda sem regra verificada (quina) rejeita cálculo por modalidade com 409
    const awaitingRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryCode: 'quina',
        universeSize: 80,
        drawnCount: 5,
        chosenCount: 5,
      }),
    });
    expect(awaitingRes.status).toBe(409);
    expect((await awaitingRes.json()).error).toBe('MODALITY_AWAITING_CONFIGURATION');

    // 1b. Cálculo especializado no banco real para Mega-Sena (m=7, tarifa vigente R$ 6,00 -> R$ 42,00)
    const megaSpecRes = await fetch(`${baseUrl}/api/math/local/specialized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryCode: 'mega-sena',
        chosenCount: 7,
        simpleGamesCount: 7,
      }),
    });
    expect(megaSpecRes.status).toBe(200);
    const megaSpecJson = await megaSpecRes.json();
    expect(megaSpecJson.totalChosenCombinations).toBe('386206920');
    expect(megaSpecJson.multipleBet.equivalentSimpleBets).toBe('7');
    expect(megaSpecJson.multipleBet.totalCostCents).toBe('4200');
    expect(megaSpecJson.prizeTiers.length).toBe(3);

    // 1c. Cálculo especializado no banco real para Lotofácil (m=16, tarifa vigente R$ 3,50 -> R$ 56,00)
    const lotoSpecRes = await fetch(`${baseUrl}/api/math/local/specialized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryCode: 'lotofacil',
        chosenCount: 16,
      }),
    });
    expect(lotoSpecRes.status).toBe(200);
    const lotoSpecJson = await lotoSpecRes.json();
    expect(lotoSpecJson.totalChosenCombinations).toBe('2042975'); // C(25,16)
    expect(lotoSpecJson.multipleBet.equivalentSimpleBets).toBe('16');
    expect(lotoSpecJson.multipleBet.totalCostCents).toBe('5600');
    expect(lotoSpecJson.prizeTiers.length).toBe(5);

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

    const [expiredRule] = await db
      .insert(lotteryRuleVersions)
      .values({
        lotteryTypeId: insertedLottery.id,
        versionNumber: 1,
        minNumbersToChoose: 5,
        maxNumbersToChoose: 7,
        numberUniverseMin: 1,
        numberUniverseMax: 20,
        drawnNumbersCount: 5,
        validFrom: new Date('2019-01-01T00:00:00Z'),
        validTo: new Date('2024-12-31T23:59:59Z'),
        officialSource: 'Fonte Histórica Expirada',
        isVerified: true,
        isLocked: true,
      })
      .returning();

    const [insertedRule] = await db
      .insert(lotteryRuleVersions)
      .values({
        lotteryTypeId: insertedLottery.id,
        versionNumber: 2,
        minNumbersToChoose: 5,
        maxNumbersToChoose: 7,
        numberUniverseMin: 1,
        numberUniverseMax: 25,
        drawnNumbersCount: 5,
        validFrom: new Date('2025-01-01T00:00:00Z'),
        validTo: null,
        officialSource: 'Fonte de Homologação Automatizada',
        isVerified: true,
        isLocked: false,
      })
      .returning();

    const [futureRule] = await db
      .insert(lotteryRuleVersions)
      .values({
        lotteryTypeId: insertedLottery.id,
        versionNumber: 3,
        minNumbersToChoose: 5,
        maxNumbersToChoose: 8,
        numberUniverseMin: 1,
        numberUniverseMax: 30,
        drawnNumbersCount: 5,
        validFrom: new Date('2099-01-01T00:00:00Z'),
        validTo: null,
        officialSource: 'Fonte Futura Homologação',
        isVerified: true,
        isLocked: false,
      })
      .returning();

    const [historicalContest] = await db
      .insert(contests)
      .values({
        lotteryTypeId: insertedLottery.id,
        ruleVersionId: expiredRule.id,
        contestNumber: 100,
        drawDate: new Date('2021-06-15T20:00:00Z'),
        status: 'verified',
      })
      .returning();

    // GET /api/lotteries/:id deve selecionar apenas v2 atualmente e v1 para data histórica 2021
    const detailNowRes = await fetch(`${baseUrl}/api/lotteries/${insertedLottery.id}`);
    expect(detailNowRes.status).toBe(200);
    expect((await detailNowRes.json()).activeRuleVersionId).toBe(insertedRule.id);

    const detailHistRes = await fetch(
      `${baseUrl}/api/lotteries/${insertedLottery.id}?referenceDate=2021-06-15T20:00:00.000Z`
    );
    expect(detailHistRes.status).toBe(200);
    expect((await detailHistRes.json()).activeRuleVersionId).toBe(expiredRule.id);

    // Regra futura explícita no cálculo atual -> 409 RULE_VERSION_FUTURE
    const futureRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: insertedLottery.id,
        lotteryCode: testCode,
        ruleVersionId: futureRule.id,
        chosenCount: 5,
      }),
    });
    expect(futureRes.status).toBe(409);
    expect((await futureRes.json()).error).toBe('RULE_VERSION_FUTURE');

    // Regra expirada explícita no cálculo atual -> 409 RULE_VERSION_EXPIRED
    const expiredRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: insertedLottery.id,
        lotteryCode: testCode,
        ruleVersionId: expiredRule.id,
        chosenCount: 5,
      }),
    });
    expect(expiredRes.status).toBe(409);
    expect((await expiredRes.json()).error).toBe('RULE_VERSION_EXPIRED');

    // Concurso histórico no banco seleciona automaticamente expiredRule (v1) vigente em 2021
    const contestCalcRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: insertedLottery.id,
        lotteryCode: testCode,
        contestId: historicalContest.id,
        chosenCount: 5,
      }),
    });
    expect(contestCalcRes.status).toBe(200);
    const contestCalcJson = await contestCalcRes.json();
    expect(contestCalcJson.totalCombinations).toBe('15504'); // C(20, 5)
    expect(contestCalcJson.modalityContext).toMatchObject({
      ruleVersionId: expiredRule.id,
      contestId: historicalContest.id,
      contestNumber: 100,
      referenceSource: 'historical_contest',
    });

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
      ruleVersionNumber: 2,
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
