import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.ts';
import { contests, drawnNumbers, lotteryTypes, prizeTiers } from '../../../src/db/schema.ts';
import { validateQuery } from '../../middleware/validate.ts';

export const contestsRouter = Router();

const listContestsSchema = z.object({
  lotteryId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

contestsRouter.get('/', validateQuery(listContestsSchema), async (req, res) => {
  try {
    const query = (req as unknown as { validatedQuery: z.infer<typeof listContestsSchema> })
      .validatedQuery;

    const conditions = [];
    if (query.lotteryId) {
      conditions.push(eq(contests.lotteryTypeId, query.lotteryId));
    }

    const rows = await db
      .select({
        id: contests.id,
        lotteryTypeId: contests.lotteryTypeId,
        lotteryName: lotteryTypes.name,
        lotteryCode: lotteryTypes.code,
        contestNumber: contests.contestNumber,
        drawDate: contests.drawDate,
        status: contests.status,
        updatedAt: contests.updatedAt,
      })
      .from(contests)
      .innerJoin(lotteryTypes, eq(contests.lotteryTypeId, lotteryTypes.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contests.contestNumber))
      .limit(query.limit);

    return res.json({
      hasVerifiedSourceData: rows.length > 0,
      notice:
        rows.length === 0
          ? 'Nenhum concurso ingerido na Etapa 1. Resultados oficiais serão exibidos exclusivamente após validação de fonte oficial na Etapa 2.'
          : null,
      total: rows.length,
      items: rows,
    });
  } catch (error) {
    console.error('Failed to list contests:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Não foi possível consultar concursos no momento.',
    });
  }
});

contestsRouter.get('/:id', async (req, res) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isInteger(contestId) || contestId <= 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Identificador de concurso inválido.',
      });
    }

    const rows = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
    const contest = rows[0];
    if (!contest) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Concurso não encontrado.',
      });
    }

    const numbers = await db
      .select()
      .from(drawnNumbers)
      .where(eq(drawnNumbers.contestId, contest.id));

    const tiers = await db
      .select()
      .from(prizeTiers)
      .where(eq(prizeTiers.contestId, contest.id));

    return res.json({
      ...contest,
      drawnNumbers: numbers,
      prizeTiers: tiers,
    });
  } catch (error) {
    console.error('Failed to fetch contest details:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Não foi possível recuperar os detalhes do concurso.',
    });
  }
});
