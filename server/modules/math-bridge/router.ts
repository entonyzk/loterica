import { Router } from 'express';
import { z } from 'zod';
import {
  computeSpecializedModalityAnalysis,
  validateExplicitSimpleBets,
} from '../../../src/modules/probabilities/specialized.ts';
import { validateBody } from '../../middleware/validate.ts';
import {
  MathEngineError,
  checkPythonEngineHealth,
  computeLocalTheoreticalDistribution,
  requestPythonSpecializedProbability,
  requestPythonTheoreticalProbability,
} from './client.ts';
import {
  requestPythonCombinationsAnalyze,
  requestPythonCombinationsCompare,
  requestPythonCombinationsCoverage,
  requestPythonCombinationsGenerate,
} from './combinations-client.ts';
import {
  type ModalityRuleRepository,
  ModalityValidationError,
  postgresModalityRuleRepository,
  resolveAndValidateTheoreticalInput,
} from './modality-validator.ts';

const theoreticalRequestSchema = z
  .object({
    mode: z.enum(['free', 'modality']).optional(),
    lotteryId: z.number().int().positive().optional(),
    lotteryCode: z.string().trim().min(2).max(64).default('generic-reference'),
    ruleVersionId: z.number().int().positive().optional(),
    contestId: z.number().int().positive().optional(),
    contestNumber: z.number().int().positive().optional(),
    referenceDate: z.string().trim().min(4).max(64).optional(),
    universeSize: z.number().int().min(1).max(1000).optional(),
    drawnCount: z.number().int().min(0).max(1000).optional(),
    chosenCount: z.number().int().min(0).max(1000),
  })
  .strict();

const specializedRequestSchema = theoreticalRequestSchema
  .extend({
    simpleGamesCount: z.number().int().min(1).max(1_000_000).optional(),
    simpleBets: z.array(z.array(z.number().int().min(1).max(1000)).min(1).max(100)).min(1).max(12).optional(),
  })
  .strict();

const modalityBaseSchema = z.object({
  mode: z.enum(['free', 'modality']).optional(),
  lotteryId: z.number().int().positive().optional(),
  lotteryCode: z.string().trim().min(2).max(64).default('generic-reference'),
  ruleVersionId: z.number().int().positive().optional(),
  contestId: z.number().int().positive().optional(),
  contestNumber: z.number().int().positive().optional(),
  referenceDate: z.string().trim().min(4).max(64).optional(),
  universeSize: z.number().int().min(1).max(1000).optional(),
  drawnCount: z.number().int().min(1).max(1000).optional(),
});

const generationMethodSchema = z.enum([
  'exhaustive',
  'uniform_sampling',
  'coverage_heuristic',
  'combinatorial_search',
]);

const combinationsAnalyzeRequestSchema = modalityBaseSchema
  .extend({
    chosenCount: z.number().int().min(1).max(1000),
    fixedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    excludedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    variableNumbers: z.array(z.number().int().min(1).max(1000)).optional(),
    desiredGamesCount: z.number().int().min(1).max(1_000_000).default(1),
    maxBudgetCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    bets: z.array(z.array(z.number().int().min(1).max(1000)).min(1).max(100)).min(1).max(500).optional(),
  })
  .strict();

const combinationsCoverageRequestSchema = modalityBaseSchema
  .extend({
    chosenCount: z.number().int().min(1).max(1000),
    bets: z.array(z.array(z.number().int().min(1).max(1000)).min(1).max(100)).min(1).max(500),
    targetSubsetSize: z.number().int().min(1).max(100),
    poolNumbers: z.array(z.number().int().min(1).max(1000)).optional(),
  })
  .strict();

const combinationsGenerateRequestSchema = modalityBaseSchema
  .extend({
    chosenCount: z.number().int().min(1).max(1000),
    fixedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    excludedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    variableNumbers: z.array(z.number().int().min(1).max(1000)).optional(),
    desiredGamesCount: z.number().int().min(1).max(300).default(10),
    method: generationMethodSchema.default('uniform_sampling'),
    coverageTargetT: z.number().int().min(1).max(100).optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    maxBudgetCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    minEven: z.number().int().min(0).max(1000).optional(),
    maxEven: z.number().int().min(0).max(1000).optional(),
    minSum: z.number().int().min(0).max(100_000).optional(),
    maxSum: z.number().int().min(0).max(100_000).optional(),
    maxConsecutive: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

const strategySpecSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    chosenCount: z.number().int().min(1).max(1000),
    fixedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    excludedNumbers: z.array(z.number().int().min(1).max(1000)).default([]),
    desiredGamesCount: z.number().int().min(1).max(300).default(5),
    method: generationMethodSchema.default('coverage_heuristic'),
    coverageTargetT: z.number().int().min(1).max(100).optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    maxBudgetCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    bets: z.array(z.array(z.number().int().min(1).max(1000)).min(1).max(100)).min(1).max(300).optional(),
  })
  .strict();

const combinationsCompareRequestSchema = modalityBaseSchema
  .extend({
    strategies: z.array(strategySpecSchema).min(1).max(5),
  })
  .strict();

export function createMathRouter(
  repository: ModalityRuleRepository = postgresModalityRuleRepository
) {
  const router = Router();

  /**
   * Execução determinística local em Node.js (BigInt exato).
   * Valida estritamente modalidades verificadas ou opera em modo livre independente do catálogo.
   */
  router.post('/local/theoretical', validateBody(theoreticalRequestSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof theoreticalRequestSchema>;
      const validated = await resolveAndValidateTheoreticalInput(payload, repository);
      const result = computeLocalTheoreticalDistribution(
        validated.universeSize,
        validated.drawnCount,
        validated.chosenCount
      );
      return res.json({
        lotteryCode: validated.lotteryCode,
        modalityContext: validated.modalityContext,
        ...result,
      });
    } catch (error) {
      if (error instanceof ModalityValidationError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      return res.status(400).json({
        error: 'COMBINATORIAL_VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Parâmetros inválidos.',
      });
    }
  });

  /**
   * Análise especializada local em Node.js (BigInt exato) para modalidades verificadas
   * (faixas oficiais, P(premiação) vs P(sem prêmio), apostas simples vs múltiplas, memória de cálculo).
   */
  router.post('/local/specialized', validateBody(specializedRequestSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof specializedRequestSchema>;
      if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
        return res.status(400).json({
          error: 'GENERIC_CODE_NOT_ALLOWED',
          message:
            'A rota especializada aceita exclusivamente modalidades oficiais cadastradas. Utilize /api/math/local/theoretical para Parâmetros Livres.',
        });
      }
      const validated = await resolveAndValidateTheoreticalInput(
        { ...payload, mode: 'modality' },
        repository
      );
      if (validated.modalityContext.mode !== 'modality') {
        return res.status(400).json({
          error: 'MODALITY_REQUIRED',
          message: 'O cálculo especializado requer uma modalidade verificada.',
        });
      }
      const ctx = validated.modalityContext;
      let normalizedBets: number[][] | undefined;
      if (payload.simpleBets) {
        normalizedBets = validateExplicitSimpleBets(
          payload.simpleBets,
          ctx.universeSize,
          ctx.drawnCount
        );
        if (
          payload.simpleGamesCount !== undefined &&
          payload.simpleGamesCount !== normalizedBets.length
        ) {
          return res.status(400).json({
            error: 'SIMPLE_BETS_COUNT_MISMATCH',
            message: `simpleGamesCount (${payload.simpleGamesCount}) diverge da quantidade de apostas informadas (${normalizedBets.length}).`,
          });
        }
      }

      const specialized = computeSpecializedModalityAnalysis({
        lotteryCode: ctx.lotteryCode,
        mathModelType: ctx.mathModelType,
        universeSize: ctx.universeSize,
        drawnCount: ctx.drawnCount,
        chosenCount: ctx.chosenCount,
        minNumbersToChoose: ctx.minNumbersToChoose,
        maxNumbersToChoose: ctx.maxNumbersToChoose,
        prizeTiers: ctx.prizeTiers,
        simpleBetPriceCents: ctx.simpleBetPriceCents,
        priceUpdatedAt: ctx.priceUpdatedAt,
        priceSource: ctx.priceSource,
        simpleGamesCount: payload.simpleGamesCount,
        simpleBets: normalizedBets,
      });

      return res.json({
        executionSource: 'nodejs_local_bigint',
        modalityContext: ctx,
        ...specialized,
      });
    } catch (error) {
      if (error instanceof ModalityValidationError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      return res.status(400).json({
        error: 'COMBINATORIAL_VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Parâmetros inválidos.',
      });
    }
  });

  /**
   * Verificação de saúde do microsserviço Python FastAPI.
   * Retorna 503/504 explícito se offline — nunca simula sucesso.
   */
  router.get('/python/health', async (_req, res) => {
    try {
      const health = await checkPythonEngineHealth();
      return res.json(health);
    } catch (error) {
      if (error instanceof MathEngineError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      console.error('Unexpected error checking Python engine health:', error);
      return res.status(503).json({
        error: 'MATH_ENGINE_UNAVAILABLE',
        message: 'Falha ao consultar o motor matemático Python.',
      });
    }
  });

  /**
   * Execução remota via HTTP no microsserviço Python FastAPI (/v1/probabilities/theoretical).
   * Valida modalidade/regra verificada antes da chamada remota e rejeita qualquer inconsistência Python.
   */
  router.post('/python/theoretical', validateBody(theoreticalRequestSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof theoreticalRequestSchema>;
      const validated = await resolveAndValidateTheoreticalInput(payload, repository);
      const result = await requestPythonTheoreticalProbability({
        lotteryCode: validated.lotteryCode,
        universeSize: validated.universeSize,
        drawnCount: validated.drawnCount,
        chosenCount: validated.chosenCount,
      });
      return res.json({
        ...result,
        modalityContext: validated.modalityContext,
      });
    } catch (error) {
      if (error instanceof ModalityValidationError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof MathEngineError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      console.error('Unexpected error calling Python math engine:', error);
      return res.status(503).json({
        error: 'MATH_ENGINE_UNAVAILABLE',
        message: 'Falha de comunicação com o motor matemático Python.',
      });
    }
  });

  /**
   * Execução especializada via HTTP no microsserviço Python FastAPI (/v1/probabilities/specialized).
   */
  router.post('/python/specialized', validateBody(specializedRequestSchema), async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof specializedRequestSchema>;
      if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
        return res.status(400).json({
          error: 'GENERIC_CODE_NOT_ALLOWED',
          message:
            'A rota especializada aceita exclusivamente modalidades oficiais cadastradas. Utilize /api/math/python/theoretical para Parâmetros Livres.',
        });
      }
      const validated = await resolveAndValidateTheoreticalInput(
        { ...payload, mode: 'modality' },
        repository
      );
      if (validated.modalityContext.mode !== 'modality') {
        return res.status(400).json({
          error: 'MODALITY_REQUIRED',
          message: 'O cálculo especializado requer uma modalidade verificada.',
        });
      }
      const ctx = validated.modalityContext;
      let normalizedBets: number[][] | undefined;
      if (payload.simpleBets) {
        normalizedBets = validateExplicitSimpleBets(
          payload.simpleBets,
          ctx.universeSize,
          ctx.drawnCount
        );
        if (
          payload.simpleGamesCount !== undefined &&
          payload.simpleGamesCount !== normalizedBets.length
        ) {
          return res.status(400).json({
            error: 'SIMPLE_BETS_COUNT_MISMATCH',
            message: `simpleGamesCount (${payload.simpleGamesCount}) diverge da quantidade de apostas informadas (${normalizedBets.length}).`,
          });
        }
      }

      const result = await requestPythonSpecializedProbability({
        lotteryCode: ctx.lotteryCode,
        mathModelType: ctx.mathModelType,
        universeSize: ctx.universeSize,
        drawnCount: ctx.drawnCount,
        chosenCount: ctx.chosenCount,
        minNumbersToChoose: ctx.minNumbersToChoose,
        maxNumbersToChoose: ctx.maxNumbersToChoose,
        prizeTiers: ctx.prizeTiers,
        simpleBetPriceCents: ctx.simpleBetPriceCents,
        priceUpdatedAt: ctx.priceUpdatedAt,
        priceSource: ctx.priceSource,
        simpleGamesCount: payload.simpleGamesCount,
        simpleBets: normalizedBets,
      });
      return res.json({
        ...result,
        modalityContext: ctx,
      });
    } catch (error) {
      if (error instanceof ModalityValidationError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof MathEngineError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof Error && error.message.includes('Aposta simples')) {
        return res.status(400).json({
          error: 'COMBINATORIAL_VALIDATION_ERROR',
          message: error.message,
        });
      }
      console.error('Unexpected error calling Python specialized math engine:', error);
      return res.status(503).json({
        error: 'MATH_ENGINE_UNAVAILABLE',
        message: 'Falha de comunicação com o motor matemático Python.',
      });
    }
  });

  /**
   * Etapa 3 — Laboratório de Combinações: análise do espaço restrito, fixos/excluídos,
   * orçamento e análise combinatória de conjunto submetido (/v1/combinations/analyze).
   */
  router.post(
    '/python/combinations/analyze',
    validateBody(combinationsAnalyzeRequestSchema),
    async (req, res) => {
      try {
        const payload = req.body as z.infer<typeof combinationsAnalyzeRequestSchema>;
        if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
          return res.status(400).json({
            error: 'GENERIC_CODE_NOT_ALLOWED',
            message:
              'O Laboratório de Combinações opera exclusivamente com modalidades oficiais verificadas.',
          });
        }
        const validated = await resolveAndValidateTheoreticalInput(
          { ...payload, mode: 'modality' },
          repository
        );
        if (validated.modalityContext.mode !== 'modality') {
          return res.status(400).json({
            error: 'MODALITY_REQUIRED',
            message: 'Requer modalidade oficialmente verificada.',
          });
        }
        const ctx = validated.modalityContext;
        const result = await requestPythonCombinationsAnalyze({
          lotteryCode: ctx.lotteryCode,
          mathModelType: ctx.mathModelType,
          universeSize: ctx.universeSize,
          drawnCount: ctx.drawnCount,
          chosenCount: ctx.chosenCount,
          minNumbersToChoose: ctx.minNumbersToChoose,
          maxNumbersToChoose: ctx.maxNumbersToChoose,
          prizeTiers: ctx.prizeTiers,
          simpleBetPriceCents: ctx.simpleBetPriceCents,
          priceUpdatedAt: ctx.priceUpdatedAt,
          priceSource: ctx.priceSource,
          fixedNumbers: payload.fixedNumbers,
          excludedNumbers: payload.excludedNumbers,
          variableNumbers: payload.variableNumbers,
          desiredGamesCount: payload.desiredGamesCount,
          maxBudgetCents: payload.maxBudgetCents,
          bets: payload.bets,
        });
        return res.json({
          ...result,
          modalityContext: ctx,
        });
      } catch (error) {
        if (error instanceof ModalityValidationError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        if (error instanceof MathEngineError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        console.error('Unexpected error calling Python /combinations/analyze:', error);
        return res.status(503).json({
          error: 'MATH_ENGINE_UNAVAILABLE',
          message: 'Falha de comunicação com o motor matemático Python.',
        });
      }
    }
  );

  /**
   * Etapa 3 — Sistema exato de estudo de cobertura de t-subconjuntos (/v1/combinations/coverage).
   */
  router.post(
    '/python/combinations/coverage',
    validateBody(combinationsCoverageRequestSchema),
    async (req, res) => {
      try {
        const payload = req.body as z.infer<typeof combinationsCoverageRequestSchema>;
        if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
          return res.status(400).json({
            error: 'GENERIC_CODE_NOT_ALLOWED',
            message:
              'O estudo de cobertura opera exclusivamente com modalidades oficiais verificadas.',
          });
        }
        const validated = await resolveAndValidateTheoreticalInput(
          { ...payload, mode: 'modality' },
          repository
        );
        if (validated.modalityContext.mode !== 'modality') {
          return res.status(400).json({
            error: 'MODALITY_REQUIRED',
            message: 'Requer modalidade oficialmente verificada.',
          });
        }
        const ctx = validated.modalityContext;
        const result = await requestPythonCombinationsCoverage({
          lotteryCode: ctx.lotteryCode,
          mathModelType: ctx.mathModelType,
          universeSize: ctx.universeSize,
          drawnCount: ctx.drawnCount,
          chosenCount: ctx.chosenCount,
          minNumbersToChoose: ctx.minNumbersToChoose,
          maxNumbersToChoose: ctx.maxNumbersToChoose,
          prizeTiers: ctx.prizeTiers,
          bets: payload.bets,
          targetSubsetSize: payload.targetSubsetSize,
          poolNumbers: payload.poolNumbers,
        });
        return res.json({
          ...result,
          modalityContext: ctx,
        });
      } catch (error) {
        if (error instanceof ModalityValidationError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        if (error instanceof MathEngineError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        console.error('Unexpected error calling Python /combinations/coverage:', error);
        return res.status(503).json({
          error: 'MATH_ENGINE_UNAVAILABLE',
          message: 'Falha de comunicação com o motor matemático Python.',
        });
      }
    }
  );

  /**
   * Etapa 3 — Gerador controlado sem duplicatas (/v1/combinations/generate).
   */
  router.post(
    '/python/combinations/generate',
    validateBody(combinationsGenerateRequestSchema),
    async (req, res) => {
      try {
        const payload = req.body as z.infer<typeof combinationsGenerateRequestSchema>;
        if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
          return res.status(400).json({
            error: 'GENERIC_CODE_NOT_ALLOWED',
            message:
              'O gerador controlado opera exclusivamente com modalidades oficiais verificadas.',
          });
        }
        const validated = await resolveAndValidateTheoreticalInput(
          { ...payload, mode: 'modality' },
          repository
        );
        if (validated.modalityContext.mode !== 'modality') {
          return res.status(400).json({
            error: 'MODALITY_REQUIRED',
            message: 'Requer modalidade oficialmente verificada.',
          });
        }
        const ctx = validated.modalityContext;
        const result = await requestPythonCombinationsGenerate({
          lotteryCode: ctx.lotteryCode,
          mathModelType: ctx.mathModelType,
          universeSize: ctx.universeSize,
          drawnCount: ctx.drawnCount,
          chosenCount: ctx.chosenCount,
          minNumbersToChoose: ctx.minNumbersToChoose,
          maxNumbersToChoose: ctx.maxNumbersToChoose,
          prizeTiers: ctx.prizeTiers,
          simpleBetPriceCents: ctx.simpleBetPriceCents,
          priceUpdatedAt: ctx.priceUpdatedAt,
          priceSource: ctx.priceSource,
          fixedNumbers: payload.fixedNumbers,
          excludedNumbers: payload.excludedNumbers,
          variableNumbers: payload.variableNumbers,
          desiredGamesCount: payload.desiredGamesCount,
          method: payload.method,
          coverageTargetT: payload.coverageTargetT,
          seed: payload.seed,
          maxBudgetCents: payload.maxBudgetCents,
          minEven: payload.minEven,
          maxEven: payload.maxEven,
          minSum: payload.minSum,
          maxSum: payload.maxSum,
          maxConsecutive: payload.maxConsecutive,
        });
        return res.json({
          ...result,
          modalityContext: ctx,
        });
      } catch (error) {
        if (error instanceof ModalityValidationError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        if (error instanceof MathEngineError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        console.error('Unexpected error calling Python /combinations/generate:', error);
        return res.status(503).json({
          error: 'MATH_ENGINE_UNAVAILABLE',
          message: 'Falha de comunicação com o motor matemático Python.',
        });
      }
    }
  );

  /**
   * Etapa 3 — Comparador simultâneo de até 5 estratégias combinatórias (/v1/combinations/compare).
   */
  router.post(
    '/python/combinations/compare',
    validateBody(combinationsCompareRequestSchema),
    async (req, res) => {
      try {
        const payload = req.body as z.infer<typeof combinationsCompareRequestSchema>;
        if (payload.lotteryCode === 'generic-reference' || payload.mode === 'free') {
          return res.status(400).json({
            error: 'GENERIC_CODE_NOT_ALLOWED',
            message:
              'O comparador de estratégias opera exclusivamente com modalidades oficiais verificadas.',
          });
        }
        const validated = await resolveAndValidateTheoreticalInput(
          {
            ...payload,
            chosenCount: payload.strategies[0].chosenCount,
            mode: 'modality',
          },
          repository
        );
        if (validated.modalityContext.mode !== 'modality') {
          return res.status(400).json({
            error: 'MODALITY_REQUIRED',
            message: 'Requer modalidade oficialmente verificada.',
          });
        }
        const ctx = validated.modalityContext;
        for (const strategy of payload.strategies) {
          if (
            strategy.chosenCount < ctx.minNumbersToChoose ||
            strategy.chosenCount > ctx.maxNumbersToChoose
          ) {
            return res.status(400).json({
              error: 'MODALITY_CHOSEN_OUT_OF_RANGE',
              message: `Estratégia "${strategy.name}": quantidade de dezenas (${strategy.chosenCount}) fora dos limites oficiais [${ctx.minNumbersToChoose}..${ctx.maxNumbersToChoose}].`,
            });
          }
        }
        const result = await requestPythonCombinationsCompare({
          lotteryCode: ctx.lotteryCode,
          mathModelType: ctx.mathModelType,
          universeSize: ctx.universeSize,
          drawnCount: ctx.drawnCount,
          minNumbersToChoose: ctx.minNumbersToChoose,
          maxNumbersToChoose: ctx.maxNumbersToChoose,
          prizeTiers: ctx.prizeTiers,
          simpleBetPriceCents: ctx.simpleBetPriceCents,
          priceUpdatedAt: ctx.priceUpdatedAt,
          priceSource: ctx.priceSource,
          strategies: payload.strategies,
        });
        return res.json({
          ...result,
          modalityContext: ctx,
        });
      } catch (error) {
        if (error instanceof ModalityValidationError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        if (error instanceof MathEngineError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message });
        }
        console.error('Unexpected error calling Python /combinations/compare:', error);
        return res.status(503).json({
          error: 'MATH_ENGINE_UNAVAILABLE',
          message: 'Falha de comunicação com o motor matemático Python.',
        });
      }
    }
  );

  return router;
}

export const mathRouter = createMathRouter();
