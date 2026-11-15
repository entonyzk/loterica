import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.ts';
import {
  MathEngineError,
  checkPythonEngineHealth,
  computeLocalTheoreticalDistribution,
  requestPythonTheoreticalProbability,
} from './client.ts';

export const mathRouter = Router();

const theoreticalRequestSchema = z
  .object({
    lotteryCode: z.string().trim().min(2).max(64).default('generic-reference'),
    universeSize: z.number().int().min(1).max(1000),
    drawnCount: z.number().int().min(0).max(1000),
    chosenCount: z.number().int().min(0).max(1000),
  })
  .refine((data) => data.drawnCount <= data.universeSize && data.chosenCount <= data.universeSize, {
    message: 'drawnCount e chosenCount devem ser menores ou iguais a universeSize.',
  });

/**
 * Execução determinística local em Node.js (BigInt exato).
 * Claramente separada do motor científico Python.
 */
mathRouter.post('/local/theoretical', validateBody(theoreticalRequestSchema), (req, res) => {
  try {
    const { lotteryCode, universeSize, drawnCount, chosenCount } = req.body as z.infer<
      typeof theoreticalRequestSchema
    >;
    const result = computeLocalTheoreticalDistribution(universeSize, drawnCount, chosenCount);
    return res.json({
      lotteryCode,
      ...result,
    });
  } catch (error) {
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
mathRouter.get('/python/health', async (_req, res) => {
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
 * Falhas de timeout, indisponibilidade ou contrato inválido retornam erro explícito (sem fallback silencioso).
 */
mathRouter.post(
  '/python/theoretical',
  validateBody(theoreticalRequestSchema),
  async (req, res) => {
    try {
      const payload = req.body as z.infer<typeof theoreticalRequestSchema>;
      const result = await requestPythonTheoreticalProbability(payload);
      return res.json(result);
    } catch (error) {
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
  }
);
