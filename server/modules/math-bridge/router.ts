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

  return router;
}

export const mathRouter = createMathRouter();
