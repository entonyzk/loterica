import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_SUM_TOLERANCE,
  computeLocalTheoreticalDistribution,
  exactCombinationsBigInt,
  hypergeometricDetail,
  hypergeometricProbability,
} from '../../server/modules/math-bridge/client.ts';
import type { ModalityRuleRepository } from '../../server/modules/math-bridge/modality-validator.ts';
import { createMathRouter } from '../../server/modules/math-bridge/router.ts';
import { hashPassword, verifyPassword } from '../../src/db/users.ts';
import {
  computeEmbeddedSimpleWins,
  computeSpecializedModalityAnalysis,
} from '../../src/modules/probabilities/specialized.ts';

function buildFullValidPythonPayload(params: {
  lotteryCode: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
}) {
  const local = computeLocalTheoreticalDistribution(
    params.universeSize,
    params.drawnCount,
    params.chosenCount
  );
  const distributionByHits: Record<string, Record<string, unknown>> = {};
  let sum = 0;
  for (const row of local.distribution) {
    distributionByHits[String(row.hits)] = {
      hits: row.hits,
      probability: row.probability,
      raw_numerator: row.rawNumerator,
      raw_denominator: row.rawDenominator,
      exact_numerator: row.exactNumerator,
      exact_denominator: row.exactDenominator,
      scientific_notation: row.scientificNotation,
      is_impossible: row.isImpossible,
      precision_classification: row.precisionClassification,
    };
    sum += row.probability;
  }

  return {
    lottery_code: params.lotteryCode,
    universe_size: params.universeSize,
    drawn_count: params.drawnCount,
    chosen_count: params.chosenCount,
    total_combinations: local.totalCombinations,
    distribution_by_hits: distributionByHits,
    distribution_sum: sum,
    distribution_sum_tolerance: DISTRIBUTION_SUM_TOLERANCE,
    axiom_notice: local.axiomNotice,
    execution_source: 'python_fastapi_engine',
    engine_status: 'verified_combinatorics',
  };
}

describe('Unitários — 1. Combinatória Exata, Distribuição Hipergeométrica e Precisão', () => {
  it('calcula referências combinatórias exatas: Mega-Sena, Lotofácil e Quina', () => {
    expect(exactCombinationsBigInt(60, 6)).toBe(50_063_860n);
    expect(exactCombinationsBigInt(25, 15)).toBe(3_268_760n);
    expect(exactCombinationsBigInt(80, 5)).toBe(24_040_016n);
  });

  it('garante soma exata e decimal = 1.0 para Mega-Sena, Lotofácil e Quina', () => {
    const cases = [
      { name: 'Mega-Sena (60, 6, 6)', n: 60, k: 6, m: 6 },
      { name: 'Lotofácil (25, 15, 15)', n: 25, k: 15, m: 15 },
      { name: 'Quina (80, 5, 5)', n: 80, k: 5, m: 5 },
    ];

    for (const c of cases) {
      const result = computeLocalTheoreticalDistribution(c.n, c.k, c.m);
      const sum = result.distribution.reduce((acc, item) => acc + item.probability, 0);
      expect(Math.abs(sum - 1.0), `Soma para ${c.name}`).toBeLessThanOrEqual(
        DISTRIBUTION_SUM_TOLERANCE
      );
    }
  });

  it('preserva probabilidades muito pequenas e frações brutas/simplificadas sem truncamento', () => {
    const detail = hypergeometricDetail(100, 20, 20, 20);
    expect(detail.isImpossible).toBe(false);
    expect(detail.rawNumerator).toBe('1');
    expect(detail.rawDenominator).toBe('535983370403809682970');
    expect(detail.exactNumerator).toBe('1');
    expect(detail.exactDenominator).toBe('535983370403809682970');
    expect(detail.probability).toBeGreaterThan(0);
    expect(detail.probability).toBeCloseTo(1 / 535983370403809682970, 30);
    expect(detail.scientificNotation.startsWith('1.8657')).toBe(true);
    expect(detail.precisionClassification).toBe('exact_rational_with_float_approximation');
  });

  it('representa eventos matematicamente impossíveis como zero exato', () => {
    const impossibleLow = hypergeometricDetail(25, 15, 15, 4);
    expect(impossibleLow.isImpossible).toBe(true);
    expect(impossibleLow.probability).toBe(0);
    expect(impossibleLow.rawNumerator).toBe('0');
    expect(impossibleLow.exactNumerator).toBe('0');
    expect(impossibleLow.exactDenominator).toBe('1');
    expect(impossibleLow.precisionClassification).toBe('exact');

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

describe('Unitários — 2. Segurança de Credenciais (Hash scrypt)', () => {
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

describe('Unitários — 3. Validação Matemática e Resiliência da Ponte Node/Python', () => {
  let appServer: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    const mockRepo: ModalityRuleRepository = {
      async findLotteryById(id) {
        if (id === 1) {
          return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
        }
        if (id === 2) {
          return { id: 2, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
        }
        if (id === 3) {
          return { id: 3, code: 'future-only', name: 'Modalidade Futura', status: 'configured' };
        }
        return null;
      },
      async findLotteryByCode(code) {
        if (code === 'mega-sena') {
          return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
        }
        if (code === 'quina') {
          return { id: 2, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
        }
        if (code === 'future-only') {
          return { id: 3, code: 'future-only', name: 'Modalidade Futura', status: 'configured' };
        }
        return null;
      },
      async findRuleVersionsByLotteryId(lotteryTypeId) {
        if (lotteryTypeId === 1) {
          return [
            {
              id: 9,
              lotteryTypeId: 1,
              versionNumber: 0,
              minNumbersToChoose: 6,
              maxNumbersToChoose: 12,
              numberUniverseMin: 1,
              numberUniverseMax: 50,
              drawnNumbersCount: 5,
              officialSource: 'Regra Histórica Expirada',
              isVerified: true,
              isLocked: true,
              validFrom: new Date('2018-01-01T00:00:00Z'),
              validTo: new Date('2025-12-31T23:59:59Z'),
            },
            {
              id: 10,
              lotteryTypeId: 1,
              versionNumber: 1,
              minNumbersToChoose: 6,
              maxNumbersToChoose: 15,
              numberUniverseMin: 1,
              numberUniverseMax: 60,
              drawnNumbersCount: 6,
              officialSource: 'Regra de Referência Unitária',
              simpleBetPriceCents: 600,
              priceUpdatedAt: new Date('2025-07-10T00:00:00Z'),
              priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
              prizeTiersConfig: [
                { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
                { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
                { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
              ],
              mathModelType: 'hypergeometric_single_group',
              isVerified: true,
              isLocked: false,
              validFrom: new Date('2026-01-01T00:00:00Z'),
              validTo: null,
            },
            {
              id: 11,
              lotteryTypeId: 1,
              versionNumber: 2,
              minNumbersToChoose: 6,
              maxNumbersToChoose: 20,
              numberUniverseMin: 1,
              numberUniverseMax: 60,
              drawnNumbersCount: 6,
              officialSource: 'Rascunho não verificado',
              isVerified: false,
              isLocked: false,
              validFrom: new Date('2026-06-01T00:00:00Z'),
              validTo: null,
            },
            {
              id: 12,
              lotteryTypeId: 1,
              versionNumber: 3,
              minNumbersToChoose: 6,
              maxNumbersToChoose: 18,
              numberUniverseMin: 1,
              numberUniverseMax: 60,
              drawnNumbersCount: 6,
              officialSource: 'Regra Verificada Futura',
              isVerified: true,
              isLocked: false,
              validFrom: new Date('2099-01-01T00:00:00Z'),
              validTo: null,
            },
          ];
        }
        if (lotteryTypeId === 3) {
          return [
            {
              id: 30,
              lotteryTypeId: 3,
              versionNumber: 1,
              minNumbersToChoose: 5,
              maxNumbersToChoose: 10,
              numberUniverseMin: 1,
              numberUniverseMax: 50,
              drawnNumbersCount: 5,
              officialSource: 'Regra apenas futura',
              isVerified: true,
              isLocked: false,
              validFrom: new Date('2099-01-01T00:00:00Z'),
              validTo: null,
            },
          ];
        }
        return [];
      },
      async findContestById(id) {
        if (id === 501) {
          return {
            id: 501,
            lotteryTypeId: 1,
            ruleVersionId: 9,
            contestNumber: 1200,
            drawDate: new Date('2021-07-15T20:00:00Z'),
            status: 'verified',
          };
        }
        return null;
      },
      async findContestByLotteryAndNumber(lotteryTypeId, contestNumber) {
        if (lotteryTypeId === 1 && contestNumber === 1200) {
          return {
            id: 501,
            lotteryTypeId: 1,
            ruleVersionId: 9,
            contestNumber: 1200,
            drawDate: new Date('2021-07-15T20:00:00Z'),
            status: 'verified',
          };
        }
        return null;
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api/math', createMathRouter(mockRepo));

    await new Promise<void>((resolve) => {
      appServer = app.listen(0, '127.0.0.1', () => {
        const addr = appServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (appServer) {
      await new Promise<void>((resolve, reject) => {
        appServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('rejeita inconsistências matemáticas do motor Python (502 MATH_ENGINE_INTEGRITY_ERROR), timeout (504) e indisponibilidade (503)', async () => {
    const prevUrl = process.env.MATH_ENGINE_URL;
    const prevTimeout = process.env.MATH_ENGINE_TIMEOUT_MS;

    type StubMode =
      | 'ok'
      | 'slow'
      | 'bad_contract'
      | 'wrong_code'
      | 'wrong_params'
      | 'wrong_total'
      | 'wrong_numerator'
      | 'wrong_sum';

    let stubMode: StubMode = 'ok';

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
          }, 400);
          return;
        }

        if (stubMode === 'bad_contract') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ invalid_contract: true }));
          return;
        }

        const payload = buildFullValidPythonPayload({
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        });

        if (stubMode === 'wrong_code') {
          payload.lottery_code = 'quina';
        } else if (stubMode === 'wrong_params') {
          payload.universe_size = 59;
        } else if (stubMode === 'wrong_total') {
          payload.total_combinations = '50063861';
        } else if (stubMode === 'wrong_numerator') {
          (payload.distribution_by_hits['6'] as Record<string, unknown>).exact_numerator = '2';
        } else if (stubMode === 'wrong_sum') {
          payload.distribution_sum = 0.85;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
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

      const requestBody = JSON.stringify({
        lotteryCode: 'mega-sena',
        universeSize: 60,
        drawnCount: 6,
        chosenCount: 6,
      });

      // A. Sucesso validado integralmente
      stubMode = 'ok';
      const healthRes = await fetch(`${baseUrl}/api/math/python/health`);
      expect(healthRes.status).toBe(200);

      const okRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      expect(okRes.status).toBe(200);
      const okJson = await okRes.json();
      expect(okJson.execution_source).toBe('python_fastapi_engine');
      expect(okJson.total_combinations).toBe('50063860');
      expect(okJson.distribution_by_hits['6'].raw_numerator).toBe('1');
      expect(okJson.distribution_by_hits['6'].raw_denominator).toBe('50063860');

      // B. Divergência de modalidade, parâmetros, combinações, numerador ou soma -> 502 MATH_ENGINE_INTEGRITY_ERROR
      for (const brokenMode of [
        'wrong_code',
        'wrong_params',
        'wrong_total',
        'wrong_numerator',
        'wrong_sum',
      ] as const) {
        stubMode = brokenMode;
        const errRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });
        expect(errRes.status, `Falha esperada para modo ${brokenMode}`).toBe(502);
        expect((await errRes.json()).error).toBe('MATH_ENGINE_INTEGRITY_ERROR');
      }

      // C. Contrato JSON inválido -> 502 MATH_ENGINE_INVALID_RESPONSE
      stubMode = 'bad_contract';
      const badContract = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      expect(badContract.status).toBe(502);
      expect((await badContract.json()).error).toBe('MATH_ENGINE_INVALID_RESPONSE');

      // D. Timeout -> 504
      stubMode = 'slow';
      const timeoutRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      expect(timeoutRes.status).toBe(504);
      expect((await timeoutRes.json()).error).toBe('MATH_ENGINE_TIMEOUT');

      // E. Serviço offline -> 503
      await new Promise<void>((r) => pythonStub.close(() => r()));
      const downRes = await fetch(`${baseUrl}/api/math/python/theoretical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
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

  it('valida estritamente código, ID, versão de regra verificada, universo, sorteio e limites de dezenas vs. modo livre', async () => {
    // 1. Modo Parâmetros Livres funciona independentemente do catálogo
    const freeOk = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'free',
        lotteryCode: 'generic-reference',
        universeSize: 30,
        drawnCount: 4,
        chosenCount: 4,
      }),
    });
    expect(freeOk.status).toBe(200);
    const freeJson = await freeOk.json();
    expect(freeJson.modalityContext.mode).toBe('free');
    expect(freeJson.totalCombinations).toBe('27405');

    // 2. Modo livre não pode se passar por modalidade do catálogo
    const freeConflict = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'free',
        lotteryCode: 'mega-sena',
        universeSize: 60,
        drawnCount: 6,
        chosenCount: 6,
      }),
    });
    expect(freeConflict.status).toBe(400);
    expect((await freeConflict.json()).error).toBe('MODALITY_MODE_CONFLICT');

    // 3. Modalidade aguardando configuração (sem regra verificada) -> 409 explícito
    const awaitingRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 2,
        lotteryCode: 'quina',
        universeSize: 80,
        drawnCount: 5,
        chosenCount: 5,
      }),
    });
    expect(awaitingRes.status).toBe(409);
    expect((await awaitingRes.json()).error).toBe('MODALITY_AWAITING_CONFIGURATION');

    // 4. Divergência entre ID e código -> 400 MODALITY_MISMATCH
    const mismatchRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'quina',
        chosenCount: 6,
      }),
    });
    expect(mismatchRes.status).toBe(400);
    expect((await mismatchRes.json()).error).toBe('MODALITY_MISMATCH');

    // 5. Versão de regra não verificada explicitada -> 409 MODALITY_AWAITING_CONFIGURATION
    const unverifiedRuleRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 11,
        chosenCount: 6,
      }),
    });
    expect(unverifiedRuleRes.status).toBe(409);
    expect((await unverifiedRuleRes.json()).error).toBe('MODALITY_AWAITING_CONFIGURATION');

    // 6. Parâmetros arbitrários para modalidade -> 400 MODALITY_PARAMETER_MISMATCH
    const arbitraryParamsRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 10,
        universeSize: 55,
        drawnCount: 6,
        chosenCount: 6,
      }),
    });
    expect(arbitraryParamsRes.status).toBe(400);
    expect((await arbitraryParamsRes.json()).error).toBe('MODALITY_PARAMETER_MISMATCH');

    // 7. Dezenas escolhidas fora dos limites da regra [6..15] -> 400 MODALITY_CHOSEN_OUT_OF_RANGE
    const outOfRangeRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 10,
        chosenCount: 5,
      }),
    });
    expect(outOfRangeRes.status).toBe(400);
    expect((await outOfRangeRes.json()).error).toBe('MODALITY_CHOSEN_OUT_OF_RANGE');

    // 8. Regra verificada com todos os campos consistentes -> 200 com modalityContext validado
    const validModalityRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 10,
        universeSize: 60,
        drawnCount: 6,
        chosenCount: 6,
      }),
    });
    expect(validModalityRes.status).toBe(200);
    const validJson = await validModalityRes.json();
    expect(validJson.totalCombinations).toBe('50063860');
    expect(validJson.modalityContext).toMatchObject({
      mode: 'modality',
      lotteryId: 1,
      lotteryCode: 'mega-sena',
      ruleVersionId: 10,
      ruleVersionNumber: 1,
      isVerified: true,
    });
  });

  it('aplica vigência temporal (validFrom/validTo), bloqueia regras futuras ou expiradas e resolve concurso histórico', async () => {
    // 1. Sem ruleVersionId explícito no cálculo atual -> ignora expirada (#9), futura (#12) e não verificada (#11), selecionando #10
    const autoCurrent = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        chosenCount: 6,
      }),
    });
    expect(autoCurrent.status).toBe(200);
    const autoJson = await autoCurrent.json();
    expect(autoJson.modalityContext.ruleVersionId).toBe(10);
    expect(autoJson.modalityContext.referenceSource).toBe('current_timestamp');
    expect(typeof autoJson.modalityContext.referenceDate).toBe('string');

    // 2. Regra futura explícita para cálculo atual -> 409 RULE_VERSION_FUTURE
    const futureRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 12,
        chosenCount: 6,
      }),
    });
    expect(futureRes.status).toBe(409);
    expect((await futureRes.json()).error).toBe('RULE_VERSION_FUTURE');

    // 3. Regra expirada explícita para cálculo atual -> 409 RULE_VERSION_EXPIRED
    const expiredRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        ruleVersionId: 9,
        chosenCount: 6,
      }),
    });
    expect(expiredRes.status).toBe(409);
    expect((await expiredRes.json()).error).toBe('RULE_VERSION_EXPIRED');

    // 4. Modalidade que possui apenas regra futura -> 409 RULE_NOT_EFFECTIVE_AT_DATE
    const futureOnlyRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 3,
        lotteryCode: 'future-only',
        chosenCount: 5,
      }),
    });
    expect(futureOnlyRes.status).toBe(409);
    expect((await futureOnlyRes.json()).error).toBe('RULE_NOT_EFFECTIVE_AT_DATE');

    // 5. Cálculo com data histórica de referência (2021) -> seleciona regra #9 (N=50, k=5) e registra referenceDate
    const historicalDateRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        referenceDate: '2021-07-15T20:00:00.000Z',
        chosenCount: 6,
      }),
    });
    expect(historicalDateRes.status).toBe(200);
    const histDateJson = await historicalDateRes.json();
    expect(histDateJson.modalityContext).toMatchObject({
      ruleVersionId: 9,
      universeSize: 50,
      drawnCount: 5,
      referenceSource: 'explicit_reference_date',
      referenceDate: '2021-07-15T20:00:00.000Z',
    });

    // 6. Cálculo vinculado a concurso histórico (#501 / concurso 1200) -> identifica regra #9 vigente na drawDate
    const contestRes = await fetch(`${baseUrl}/api/math/local/theoretical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'modality',
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        contestId: 501,
        chosenCount: 6,
      }),
    });
    expect(contestRes.status).toBe(200);
    const contestJson = await contestRes.json();
    expect(contestJson.modalityContext).toMatchObject({
      ruleVersionId: 9,
      contestId: 501,
      contestNumber: 1200,
      referenceSource: 'historical_contest',
      referenceDate: '2021-07-15T20:00:00.000Z',
    });
  });
});

const MEGA_SENA_TIERS = [
  { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
  { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
  { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
] as const;

const LOTOFACIL_TIERS = [
  { hits: 15, tierName: '15 acertos', tierOrder: 1, isMainPrize: true },
  { hits: 14, tierName: '14 acertos', tierOrder: 2, isMainPrize: false },
  { hits: 13, tierName: '13 acertos', tierOrder: 3, isMainPrize: false },
  { hits: 12, tierName: '12 acertos', tierOrder: 4, isMainPrize: false },
  { hits: 11, tierName: '11 acertos', tierOrder: 5, isMainPrize: false },
] as const;

describe('Unitários — 4. Motor Especializado Etapa 2 (Mega-Sena, Lotofácil, Múltiplas e Memória)', () => {
  it('calcula referências completas da Mega-Sena (m=6, m=7 com desdobramento, m=20 extremo) e P(premiação)+P(sem prêmio)=1/1', () => {
    // Aposta simples (m=6) com tarifa oficial Caixa R$ 6,00 (600 centavos)
    const mega6 = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
      priceUpdatedAt: '2025-07-10T00:00:00.000Z',
      priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
      simpleGamesCount: 7,
    });

    expect(mega6.totalSpaceSimpleCombinations).toBe('50063860');
    expect(mega6.totalChosenCombinations).toBe('50063860');
    expect(mega6.multipleBet.isMultipleBet).toBe(false);
    expect(mega6.multipleBet.equivalentSimpleBets).toBe('1');
    expect(mega6.multipleBet.totalCostCents).toBe('600');

    const sena6 = mega6.prizeTiers.find((t) => t.hits === 6)!;
    const quina6 = mega6.prizeTiers.find((t) => t.hits === 5)!;
    const quadra6 = mega6.prizeTiers.find((t) => t.hits === 4)!;
    expect(sena6.rawNumerator).toBe('1');
    expect(sena6.exactDenominator).toBe('50063860');
    expect(quina6.rawNumerator).toBe('324'); // C(6,5)*C(54,1) = 6*54
    expect(quadra6.rawNumerator).toBe('21465'); // C(6,4)*C(54,2) = 15*1431

    // Invariante exata BigInt: anyPrize + noPrize == 1/1
    const anyNum6 = BigInt(mega6.anyPrize.exactNumerator);
    const anyDen6 = BigInt(mega6.anyPrize.exactDenominator);
    const noNum6 = BigInt(mega6.noPrize.exactNumerator);
    const noDen6 = BigInt(mega6.noPrize.exactDenominator);
    expect(anyNum6 * noDen6 + noNum6 * anyDen6).toBe(anyDen6 * noDen6);
    expect(BigInt(mega6.anyPrize.rawNumerator)).toBe(1n + 324n + 21465n);

    // Soma float = 1.0 dentro da tolerância
    const sum6 = mega6.distribution.reduce((acc, row) => acc + row.probability, 0);
    expect(Math.abs(sum6 - 1.0)).toBeLessThanOrEqual(DISTRIBUTION_SUM_TOLERANCE);

    // Memória de cálculo preenchida
    expect(sena6.memory.formula).toContain('P(X = h)');
    expect(sena6.memory.simplifiedFraction).toBe('1 / 50063860');
    expect(mega6.anyPrize.memory.plainExplanation.length).toBeGreaterThan(20);
    expect(mega6.noPrize.memory.formula).toContain('1 − P(Premiação)');

    // Comparação contra 7 jogos simples
    expect(mega6.simpleGamesComparison.simpleGamesCount).toBe(7);
    expect(mega6.simpleGamesComparison.totalCostCents).toBe('4200');
    expect(mega6.simpleGamesComparison.topPrizeExact.simplifiedNumerator).toBe('1');
    expect(mega6.simpleGamesComparison.topPrizeExact.simplifiedDenominator).toBe('7151980'); // 50063860 / 7

    // Aposta múltipla (m=7) e desdobramento de Vandermonde
    const mega7 = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 7,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
    });
    expect(mega7.totalChosenCombinations).toBe('386206920'); // C(60, 7)
    expect(mega7.multipleBet.isMultipleBet).toBe(true);
    expect(mega7.multipleBet.equivalentSimpleBets).toBe('7');
    expect(mega7.multipleBet.totalCostCents).toBe('4200');
    const desd6 = computeEmbeddedSimpleWins(7, 6, 6, MEGA_SENA_TIERS);
    expect(desd6).toEqual([
      { tierName: 'Sena', targetHits: 6, winningSimpleCombinations: '1' },
      { tierName: 'Quina', targetHits: 5, winningSimpleCombinations: '6' },
    ]);
    const desd5 = computeEmbeddedSimpleWins(7, 6, 5, MEGA_SENA_TIERS);
    expect(desd5).toEqual([
      { tierName: 'Quina', targetHits: 5, winningSimpleCombinations: '2' },
      { tierName: 'Quadra', targetHits: 4, winningSimpleCombinations: '5' },
    ]);

    // Caso extremo m=20 (38.760 apostas simples, R$ 232.560,00)
    const mega20 = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 20,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
    });
    expect(mega20.multipleBet.equivalentSimpleBets).toBe('38760');
    expect(mega20.multipleBet.totalCostCents).toBe('23256000');
    expect(mega20.comparisonRows.length).toBe(15); // m = 6..20
    const sum20 = mega20.distribution.reduce((acc, row) => acc + row.probability, 0);
    expect(Math.abs(sum20 - 1.0)).toBeLessThanOrEqual(DISTRIBUTION_SUM_TOLERANCE);
    const anyNum20 = BigInt(mega20.anyPrize.exactNumerator);
    const anyDen20 = BigInt(mega20.anyPrize.exactDenominator);
    const noNum20 = BigInt(mega20.noPrize.exactNumerator);
    const noDen20 = BigInt(mega20.noPrize.exactDenominator);
    expect(anyNum20 * noDen20 + noNum20 * anyDen20).toBe(anyDen20 * noDen20);
  });

  it('calcula referências completas da Lotofácil (m=15..20), eventos impossíveis h<5 e tarifas oficiais', () => {
    const lotofacil15 = computeSpecializedModalityAnalysis({
      lotteryCode: 'lotofacil',
      universeSize: 25,
      drawnCount: 15,
      chosenCount: 15,
      minNumbersToChoose: 15,
      maxNumbersToChoose: 20,
      prizeTiers: LOTOFACIL_TIERS,
      simpleBetPriceCents: 350,
      priceUpdatedAt: '2025-07-09T00:00:00.000Z',
    });

    expect(lotofacil15.totalSpaceSimpleCombinations).toBe('3268760');
    expect(lotofacil15.multipleBet.equivalentSimpleBets).toBe('1');
    expect(lotofacil15.multipleBet.totalCostCents).toBe('350');

    // Para m=15 em N=25, k=15, acertos h in [0..4] são impossíveis (exato 0/1)
    for (let h = 0; h <= 4; h++) {
      const pt = lotofacil15.distribution.find((d) => d.hits === h)!;
      expect(pt.isImpossible).toBe(true);
      expect(pt.probability).toBe(0);
      expect(pt.exactNumerator).toBe('0');
      expect(pt.exactDenominator).toBe('1');
    }

    // Faixas oficiais: 15, 14, 13, 12, 11 acertos
    const t15 = lotofacil15.prizeTiers.find((t) => t.hits === 15)!;
    const t14 = lotofacil15.prizeTiers.find((t) => t.hits === 14)!;
    const t13 = lotofacil15.prizeTiers.find((t) => t.hits === 13)!;
    const t12 = lotofacil15.prizeTiers.find((t) => t.hits === 12)!;
    const t11 = lotofacil15.prizeTiers.find((t) => t.hits === 11)!;
    expect(t15.rawNumerator).toBe('1');
    expect(t14.rawNumerator).toBe('150');
    expect(t13.rawNumerator).toBe('4725');
    expect(t12.rawNumerator).toBe('54600');
    expect(t11.rawNumerator).toBe('286650');

    expect(BigInt(lotofacil15.anyPrize.rawNumerator)).toBe(346126n);
    expect(BigInt(lotofacil15.noPrize.rawNumerator)).toBe(3268760n - 346126n);

    // Soma = 1.0
    const sum15 = lotofacil15.distribution.reduce((acc, row) => acc + row.probability, 0);
    expect(Math.abs(sum15 - 1.0)).toBeLessThanOrEqual(DISTRIBUTION_SUM_TOLERANCE);

    // m=16: 16 apostas simples (R$ 56,00) + desdobramento em 15 acertos
    const lotofacil16 = computeSpecializedModalityAnalysis({
      lotteryCode: 'lotofacil',
      universeSize: 25,
      drawnCount: 15,
      chosenCount: 16,
      minNumbersToChoose: 15,
      maxNumbersToChoose: 20,
      prizeTiers: LOTOFACIL_TIERS,
      simpleBetPriceCents: 350,
    });
    expect(lotofacil16.multipleBet.equivalentSimpleBets).toBe('16');
    expect(lotofacil16.multipleBet.totalCostCents).toBe('5600');
    expect(computeEmbeddedSimpleWins(16, 15, 15, LOTOFACIL_TIERS)).toEqual([
      { tierName: '15 acertos', targetHits: 15, winningSimpleCombinations: '1' },
      { tierName: '14 acertos', targetHits: 14, winningSimpleCombinations: '15' },
    ]);

    // Caso extremo m=20: C(20, 15) = 15.504 apostas simples (R$ 54.264,00)
    const lotofacil20 = computeSpecializedModalityAnalysis({
      lotteryCode: 'lotofacil',
      universeSize: 25,
      drawnCount: 15,
      chosenCount: 20,
      minNumbersToChoose: 15,
      maxNumbersToChoose: 20,
      prizeTiers: LOTOFACIL_TIERS,
      simpleBetPriceCents: 350,
    });
    expect(lotofacil20.multipleBet.equivalentSimpleBets).toBe('15504');
    expect(lotofacil20.multipleBet.totalCostCents).toBe('5426400');
    expect(lotofacil20.comparisonRows.length).toBe(6); // m = 15..20
    const anyNum20 = BigInt(lotofacil20.anyPrize.exactNumerator);
    const anyDen20 = BigInt(lotofacil20.anyPrize.exactDenominator);
    const noNum20 = BigInt(lotofacil20.noPrize.exactNumerator);
    const noDen20 = BigInt(lotofacil20.noPrize.exactDenominator);
    expect(anyNum20 * noDen20 + noNum20 * anyDen20).toBe(anyDen20 * noDen20);
  });
});

describe('Unitários — 5. Endpoints Especializados Node & Ponte Python (/api/math/*/specialized)', () => {
  let appServer: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    const repo: ModalityRuleRepository = {
      async findLotteryById(id) {
        if (id === 1) return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
        if (id === 2) return { id: 2, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
        return null;
      },
      async findLotteryByCode(code) {
        if (code === 'mega-sena') {
          return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
        }
        if (code === 'quina') {
          return { id: 2, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
        }
        return null;
      },
      async findRuleVersionsByLotteryId(lotteryTypeId) {
        if (lotteryTypeId !== 1) return [];
        return [
          {
            id: 10,
            lotteryTypeId: 1,
            versionNumber: 2,
            minNumbersToChoose: 6,
            maxNumbersToChoose: 20,
            numberUniverseMin: 1,
            numberUniverseMax: 60,
            drawnNumbersCount: 6,
            mathModelType: 'hypergeometric_single_group',
            simpleBetPriceCents: 600,
            priceUpdatedAt: new Date('2025-07-10T00:00:00Z'),
            priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
            prizeTiersConfig: [...MEGA_SENA_TIERS],
            officialSource: 'Caixa Econômica Federal — Mega-Sena',
            isVerified: true,
            isLocked: false,
            validFrom: new Date('2025-07-10T00:00:00Z'),
            validTo: null,
          },
        ];
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api/math', createMathRouter(repo));

    await new Promise<void>((resolve) => {
      appServer = app.listen(0, '127.0.0.1', () => {
        const addr = appServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (appServer) {
      await new Promise<void>((resolve, reject) => {
        appServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('executa POST /api/math/local/specialized para regra verificada e rejeita modalidade não configurada', async () => {
    const okRes = await fetch(`${baseUrl}/api/math/local/specialized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        chosenCount: 7,
        simpleGamesCount: 7,
      }),
    });
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.executionSource).toBe('nodejs_local_bigint');
    expect(json.multipleBet.equivalentSimpleBets).toBe('7');
    expect(json.multipleBet.totalCostCents).toBe('4200');
    expect(json.prizeTiers.length).toBe(3);

    const awaitingRes = await fetch(`${baseUrl}/api/math/local/specialized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lotteryCode: 'quina',
        chosenCount: 5,
      }),
    });
    expect(awaitingRes.status).toBe(409);
    expect((await awaitingRes.json()).error).toBe('MODALITY_AWAITING_CONFIGURATION');
  });

  it('valida integridade da resposta /v1/probabilities/specialized do motor Python (rejeita custo/invariante divergente)', async () => {
    const prevUrl = process.env.MATH_ENGINE_URL;
    const prevTimeout = process.env.MATH_ENGINE_TIMEOUT_MS;

    const specializedAnalysis = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 7,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
      priceUpdatedAt: '2025-07-10T00:00:00.000Z',
      priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
      simpleGamesCount: 7,
    });

    function toSnakeMemory(m: typeof specializedAnalysis.anyPrize.memory) {
      return {
        title: m.title,
        formula: m.formula,
        substituted_parameters: m.substitutedParameters,
        raw_numerator: m.rawNumerator,
        raw_denominator: m.rawDenominator,
        simplified_fraction: m.simplifiedFraction,
        decimal_probability: m.decimalProbability,
        percentage_formatted: m.percentageFormatted,
        scientific_notation: m.scientificNotation,
        odds_one_in: m.oddsOneIn,
        plain_explanation: m.plainExplanation,
      };
    }

    function toSnakeHit(h: (typeof specializedAnalysis.distribution)[number]) {
      return {
        hits: h.hits,
        probability: h.probability,
        raw_numerator: h.rawNumerator,
        raw_denominator: h.rawDenominator,
        exact_numerator: h.exactNumerator,
        exact_denominator: h.exactDenominator,
        scientific_notation: h.scientificNotation,
        is_impossible: h.isImpossible,
        precision_classification: h.precisionClassification,
        odds_one_in: h.oddsOneIn,
        tier_name: h.tierName,
        is_prize_tier: h.isPrizeTier,
        is_main_prize: h.isMainPrize,
        embedded_simple_wins: h.embeddedSimpleWins.map((w) => ({
          tier_name: w.tierName,
          target_hits: w.targetHits,
          winning_simple_combinations: w.winningSimpleCombinations,
        })),
        ...(h.expectedEmbeddedWinsPerDraw !== undefined
          ? { expected_embedded_wins_per_draw: h.expectedEmbeddedWinsPerDraw }
          : {}),
        ...(h.atLeastOneWin
          ? {
              at_least_one_win: {
                triggering_volante_hits: h.atLeastOneWin.triggeringVolanteHits,
                probability: h.atLeastOneWin.probability,
                raw_numerator: h.atLeastOneWin.rawNumerator,
                raw_denominator: h.atLeastOneWin.rawDenominator,
                exact_numerator: h.atLeastOneWin.exactNumerator,
                exact_denominator: h.atLeastOneWin.exactDenominator,
                scientific_notation: h.atLeastOneWin.scientificNotation,
                odds_one_in: h.atLeastOneWin.oddsOneIn,
                precision_classification: h.atLeastOneWin.precisionClassification,
                memory: toSnakeMemory(h.atLeastOneWin.memory),
              },
            }
          : {}),
        memory: toSnakeMemory(h.memory),
      };
    }

    function buildValidSpecializedPythonPayload() {
      const distByHits: Record<string, ReturnType<typeof toSnakeHit>> = {};
      for (const item of specializedAnalysis.distribution) {
        distByHits[String(item.hits)] = toSnakeHit(item);
      }
      const distSum = specializedAnalysis.distribution.reduce((a, b) => a + b.probability, 0);
      return {
        lottery_code: 'mega-sena',
        math_model_type: 'hypergeometric_single_group',
        universe_size: 60,
        drawn_count: 6,
        chosen_count: 7,
        total_space_simple_combinations: specializedAnalysis.totalSpaceSimpleCombinations,
        total_combinations: specializedAnalysis.totalChosenCombinations,
        distribution_by_hits: distByHits,
        distribution_sum: distSum,
        distribution_sum_tolerance: DISTRIBUTION_SUM_TOLERANCE,
        prize_tiers: specializedAnalysis.prizeTiers.map(toSnakeHit),
        any_prize: {
          label: specializedAnalysis.anyPrize.label,
          probability: specializedAnalysis.anyPrize.probability,
          raw_numerator: specializedAnalysis.anyPrize.rawNumerator,
          raw_denominator: specializedAnalysis.anyPrize.rawDenominator,
          exact_numerator: specializedAnalysis.anyPrize.exactNumerator,
          exact_denominator: specializedAnalysis.anyPrize.exactDenominator,
          scientific_notation: specializedAnalysis.anyPrize.scientificNotation,
          odds_one_in: specializedAnalysis.anyPrize.oddsOneIn,
          precision_classification: specializedAnalysis.anyPrize.precisionClassification,
          memory: toSnakeMemory(specializedAnalysis.anyPrize.memory),
        },
        no_prize: {
          label: specializedAnalysis.noPrize.label,
          probability: specializedAnalysis.noPrize.probability,
          raw_numerator: specializedAnalysis.noPrize.rawNumerator,
          raw_denominator: specializedAnalysis.noPrize.rawDenominator,
          exact_numerator: specializedAnalysis.noPrize.exactNumerator,
          exact_denominator: specializedAnalysis.noPrize.exactDenominator,
          scientific_notation: specializedAnalysis.noPrize.scientificNotation,
          odds_one_in: specializedAnalysis.noPrize.oddsOneIn,
          precision_classification: specializedAnalysis.noPrize.precisionClassification,
          memory: toSnakeMemory(specializedAnalysis.noPrize.memory),
        },
        multiple_bet: {
          chosen_count: 7,
          drawn_count: 6,
          is_multiple_bet: true,
          equivalent_simple_bets: specializedAnalysis.multipleBet.equivalentSimpleBets,
          simple_bet_price_cents: 600,
          total_cost_cents: specializedAnalysis.multipleBet.totalCostCents,
          price_updated_at: specializedAnalysis.multipleBet.priceUpdatedAt,
          price_source: specializedAnalysis.multipleBet.priceSource,
          combinatorial_coverage: {
            numerator: specializedAnalysis.multipleBet.combinatorialCoverage.numerator,
            denominator: specializedAnalysis.multipleBet.combinatorialCoverage.denominator,
            simplified_numerator:
              specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedNumerator,
            simplified_denominator:
              specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedDenominator,
            probability: specializedAnalysis.multipleBet.combinatorialCoverage.probability,
            scientific_notation:
              specializedAnalysis.multipleBet.combinatorialCoverage.scientificNotation,
            odds_one_in: specializedAnalysis.multipleBet.combinatorialCoverage.oddsOneIn,
          },
        },
        simple_games_comparison: {
          simple_games_count: 7,
          simple_bet_price_cents: 600,
          total_cost_cents: '4200',
          top_prize_exact: {
            numerator: specializedAnalysis.simpleGamesComparison.topPrizeExact.numerator,
            denominator: specializedAnalysis.simpleGamesComparison.topPrizeExact.denominator,
            simplified_numerator:
              specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedNumerator,
            simplified_denominator:
              specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedDenominator,
            probability: specializedAnalysis.simpleGamesComparison.topPrizeExact.probability,
            scientific_notation:
              specializedAnalysis.simpleGamesComparison.topPrizeExact.scientificNotation,
            odds_one_in: specializedAnalysis.simpleGamesComparison.topPrizeExact.oddsOneIn,
          },
          expected_winning_games_per_draw:
            specializedAnalysis.simpleGamesComparison.expectedWinningGamesPerDraw,
          expected_secondary_winning_games_per_draw:
            specializedAnalysis.simpleGamesComparison.expectedSecondaryWinningGamesPerDraw,
          secondary_prize_status: specializedAnalysis.simpleGamesComparison.secondaryPrizeStatus,
          overlap_dependency_notice:
            specializedAnalysis.simpleGamesComparison.overlapDependencyNotice,
          exact_union_analysis: null,
          illustrative_independent_approximation: {
            value:
              specializedAnalysis.simpleGamesComparison.illustrativeIndependentApproximation.value,
            is_exact: false as const,
            warning:
              specializedAnalysis.simpleGamesComparison.illustrativeIndependentApproximation
                .warning,
          },
          equiprobability_notice: specializedAnalysis.simpleGamesComparison.equiprobabilityNotice,
        },
        comparison_rows: specializedAnalysis.comparisonRows.map((r) => ({
          chosen_count: r.chosenCount,
          is_selected: r.isSelected,
          equivalent_simple_bets: r.equivalentSimpleBets,
          total_cost_cents: r.totalCostCents,
          total_space_combinations: r.totalSpaceCombinations,
          main_prize_hits: r.mainPrizeHits,
          main_prize_probability: r.mainPrizeProbability,
          main_prize_odds_one_in: r.mainPrizeOddsOneIn,
          any_prize_probability: r.anyPrizeProbability,
          any_prize_odds_one_in: r.anyPrizeOddsOneIn,
          no_prize_probability: r.noPrizeProbability,
          coverage_factor_vs_minimum: r.coverageFactorVsMinimum,
        })),
        axiom_notice: specializedAnalysis.equiprobabilityAxiom,
        execution_source: 'python_fastapi_engine',
        engine_status: 'verified_combinatorics',
      };
    }

    let mode: 'ok' | 'bad_cost' | 'bad_invariant' | 'bad_at_least' | 'python_404' = 'ok';
    const stub = http.createServer((req, res) => {
      if (req.url === '/v1/probabilities/specialized' && req.method === 'POST') {
        if (mode === 'python_404') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Modalidade não registrada no motor Python.' }));
          return;
        }
        const body = buildValidSpecializedPythonPayload();
        if (mode === 'bad_cost') {
          body.multiple_bet.total_cost_cents = '999999';
        } else if (mode === 'bad_invariant') {
          body.no_prize.exact_numerator = '1';
        } else if (mode === 'bad_at_least') {
          const quinaTier = body.prize_tiers.find((t) => t.hits === 5);
          if (quinaTier?.at_least_one_win) {
            quinaTier.at_least_one_win.exact_numerator = '999999';
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      }
    });

    try {
      const stubUrl = await new Promise<string>((resolve) => {
        stub.listen(0, '127.0.0.1', () => {
          const addr = stub.address() as { port: number };
          resolve(`http://127.0.0.1:${addr.port}`);
        });
      });

      process.env.MATH_ENGINE_URL = stubUrl;
      process.env.MATH_ENGINE_TIMEOUT_MS = '250';

      const reqBody = JSON.stringify({
        lotteryId: 1,
        lotteryCode: 'mega-sena',
        chosenCount: 7,
        simpleGamesCount: 7,
      });

      // Sucesso validado
      mode = 'ok';
      const okRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      expect(okRes.status).toBe(200);
      const okJson = await okRes.json();
      expect(okJson.execution_source).toBe('python_fastapi_engine');
      expect(okJson.multiple_bet.total_cost_cents).toBe('4200');
      expect(okJson.simple_games_comparison.secondary_prize_status).toBe(
        'requires_explicit_combinations'
      );

      // Rejeita generic-reference e modalidades desconhecidas -> 400 / 404
      const genericRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'generic-reference',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
        }),
      });
      expect(genericRes.status).toBe(400);
      expect((await genericRes.json()).error).toBe('GENERIC_CODE_NOT_ALLOWED');

      const unknownModRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'modalidade-inexistente',
          chosenCount: 6,
        }),
      });
      expect(unknownModRes.status).toBe(404);
      expect((await unknownModRes.json()).error).toBe('LOTTERY_NOT_FOUND');

      // Propaga 404 LOTTERY_NOT_REGISTERED do Python
      mode = 'python_404';
      const py404Res = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      expect(py404Res.status).toBe(404);
      expect((await py404Res.json()).error).toBe('LOTTERY_NOT_REGISTERED');

      // Rejeita custo adulterado -> 502
      mode = 'bad_cost';
      const badCostRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      expect(badCostRes.status).toBe(502);
      expect((await badCostRes.json()).error).toBe('MATH_ENGINE_INTEGRITY_ERROR');

      // Rejeita violação de invariante any_prize + no_prize == 1/1 -> 502
      mode = 'bad_invariant';
      const badInvRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      expect(badInvRes.status).toBe(502);
      expect((await badInvRes.json()).error).toBe('MATH_ENGINE_INTEGRITY_ERROR');

      // Rejeita fração adulterada em at_least_one_win -> 502
      mode = 'bad_at_least';
      const badAloRes = await fetch(`${baseUrl}/api/math/python/specialized`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      expect(badAloRes.status).toBe(502);
      expect((await badAloRes.json()).error).toBe('MATH_ENGINE_INTEGRITY_ERROR');
    } finally {
      process.env.MATH_ENGINE_URL = prevUrl;
      process.env.MATH_ENGINE_TIMEOUT_MS = prevTimeout;
      if (stub.listening) {
        await new Promise<void>((r) => stub.close(() => r()));
      }
    }
  });
});

describe('Unitários — 6. Correções Matemáticas Etapa 2 (P(≥ 1 em faixa), União Exata & Sobreposição)', () => {
  it('calcula P(≥ 1 prêmio na faixa) e média esperada separadamente para Mega-Sena (m=7) e Lotofácil (m=16)', () => {
    const mega7 = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 7,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
    });
    const quina7 = mega7.prizeTiers.find((t) => t.hits === 5)!;
    const h5 = mega7.distribution.find((d) => d.hits === 5)!;
    const h6 = mega7.distribution.find((d) => d.hits === 6)!;
    expect(quina7.atLeastOneWin).toBeDefined();
    expect(quina7.atLeastOneWin!.triggeringVolanteHits).toEqual([5, 6]);
    expect(BigInt(quina7.atLeastOneWin!.rawNumerator)).toBe(
      BigInt(h5.rawNumerator) + BigInt(h6.rawNumerator)
    );
    expect(quina7.expectedEmbeddedWinsPerDraw).toBeCloseTo((7 * 324) / 50063860, 12);

    const loto16 = computeSpecializedModalityAnalysis({
      lotteryCode: 'lotofacil',
      universeSize: 25,
      drawnCount: 15,
      chosenCount: 16,
      minNumbersToChoose: 15,
      maxNumbersToChoose: 20,
      prizeTiers: LOTOFACIL_TIERS,
      simpleBetPriceCents: 350,
    });
    const t14 = loto16.prizeTiers.find((t) => t.hits === 14)!;
    const d14 = loto16.distribution.find((d) => d.hits === 14)!;
    const d15 = loto16.distribution.find((d) => d.hits === 15)!;
    expect(t14.atLeastOneWin!.triggeringVolanteHits).toEqual([14, 15]);
    expect(BigInt(t14.atLeastOneWin!.rawNumerator)).toBe(
      BigInt(d14.rawNumerator) + BigInt(d15.rawNumerator)
    );
    expect(t14.expectedEmbeddedWinsPerDraw).toBeCloseTo((16 * 150) / 3268760, 12);
  });

  it('calcula união exata de prêmios secundários com combinações conhecidas e evidencia impacto da sobreposição', () => {
    const noExplicit = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
      simpleGamesCount: 2,
    });
    expect(noExplicit.simpleGamesComparison.secondaryPrizeStatus).toBe(
      'requires_explicit_combinations'
    );
    expect(noExplicit.simpleGamesComparison.exactUnionAnalysis).toBeNull();
    expect(noExplicit.simpleGamesComparison.illustrativeIndependentApproximation.isExact).toBe(
      false
    );

    const disjoint = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
      simpleBets: [
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
      ],
    });
    const highOverlap = computeSpecializedModalityAnalysis({
      lotteryCode: 'mega-sena',
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
      minNumbersToChoose: 6,
      maxNumbersToChoose: 20,
      prizeTiers: MEGA_SENA_TIERS,
      simpleBetPriceCents: 600,
      simpleBets: [
        [1, 2, 3, 4, 5, 6],
        [1, 2, 3, 4, 5, 7],
      ],
    });
    const uDis = disjoint.simpleGamesComparison.exactUnionAnalysis!;
    const uOvl = highOverlap.simpleGamesComparison.exactUnionAnalysis!;
    expect(disjoint.simpleGamesComparison.secondaryPrizeStatus).toBe('exact_union_computed');
    expect(uDis.pairwiseOverlapSummary.disjointPairsCount).toBe(1);
    expect(uOvl.pairwiseOverlapSummary.minOverlap).toBe(5);
    expect(uDis.mainPrizeUnion.rawNumerator).toBe('2');
    expect(uOvl.mainPrizeUnion.rawNumerator).toBe('2');
    expect(BigInt(uDis.secondaryPrizeUnion.rawNumerator)).toBeGreaterThan(
      BigInt(uOvl.secondaryPrizeUnion.rawNumerator)
    );
    expect(BigInt(uDis.anyPrizeUnion.rawNumerator)).toBeGreaterThan(
      BigInt(uOvl.anyPrizeUnion.rawNumerator)
    );
  });
});


