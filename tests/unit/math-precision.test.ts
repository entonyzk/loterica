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
