import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.ts';
import { lotteryRuleVersions, lotteryTypes, specialEvents } from '../../../src/db/schema.ts';
import { ensureInitialCatalogSeeded } from '../../../src/db/seed-catalog.ts';
import { validateQuery } from '../../middleware/validate.ts';

export const lotteriesRouter = Router();

let seedPromise: Promise<void> | null = null;
async function ensureSeededOnce() {
  if (!seedPromise) {
    seedPromise = ensureInitialCatalogSeeded().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

const listQuerySchema = z.object({
  status: z.enum(['awaiting_rules', 'configured', 'active', 'archived']).optional(),
});

lotteriesRouter.get('/', validateQuery(listQuerySchema), async (req, res) => {
  try {
    await ensureSeededOnce();

    const query = (req as unknown as { validatedQuery?: z.infer<typeof listQuerySchema> }).validatedQuery;

    const allLotteries = query?.status
      ? await db
          .select()
          .from(lotteryTypes)
          .where(eq(lotteryTypes.status, query.status))
          .orderBy(asc(lotteryTypes.id))
      : await db.select().from(lotteryTypes).orderBy(asc(lotteryTypes.id));

    const allEvents = await db.select().from(specialEvents).orderBy(asc(specialEvents.id));
    const allRuleVersions = await db
      .select()
      .from(lotteryRuleVersions)
      .orderBy(asc(lotteryRuleVersions.versionNumber));

    const items = allLotteries.map((lottery) => ({
      ...lottery,
      specialEvents: allEvents.filter((e) => e.lotteryTypeId === lottery.id),
      ruleVersionsCount: allRuleVersions.filter((r) => r.lotteryTypeId === lottery.id).length,
    }));

    const hasVerifiedRules = allRuleVersions.some((r) => r.isVerified);

    return res.json({
      stage: 'etapa-1-fundacao',
      rulesVerified: hasVerifiedRules,
      total: items.length,
      items,
    });
  } catch (error) {
    console.error('Failed to list lotteries:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Não foi possível consultar o catálogo de modalidades no momento.',
    });
  }
});

lotteriesRouter.get('/:id', async (req, res) => {
  try {
    await ensureSeededOnce();

    const rawId = req.params.id?.trim();
    if (!rawId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Identificador da modalidade é obrigatório.',
      });
    }

    const numericId = /^\d+$/.test(rawId) ? Number(rawId) : null;
    const rows = numericId
      ? await db.select().from(lotteryTypes).where(eq(lotteryTypes.id, numericId)).limit(1)
      : await db.select().from(lotteryTypes).where(eq(lotteryTypes.code, rawId)).limit(1);

    const lottery = rows[0];
    if (!lottery) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Modalidade não encontrada.',
      });
    }

    const events = await db
      .select()
      .from(specialEvents)
      .where(eq(specialEvents.lotteryTypeId, lottery.id))
      .orderBy(asc(specialEvents.id));

    const ruleVersions = await db
      .select()
      .from(lotteryRuleVersions)
      .where(eq(lotteryRuleVersions.lotteryTypeId, lottery.id))
      .orderBy(asc(lotteryRuleVersions.versionNumber));

    return res.json({
      ...lottery,
      specialEvents: events,
      ruleVersions,
    });
  } catch (error) {
    console.error('Failed to get lottery details:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Não foi possível recuperar os detalhes da modalidade.',
    });
  }
});
