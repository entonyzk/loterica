import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.ts';
import {
  MathEngineError,
  checkPythonEngineHealth,
  computeLocalTheoreticalDistribution,
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

  return router;
}

export const mathRouter = createMathRouter();
