import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.ts';
import { lotteryRuleVersions, lotteryTypes, specialEvents } from '../../../src/db/schema.ts';
import { ensureInitialCatalogSeeded } from '../../../src/db/seed-catalog.ts';
import {
  classifyRuleTemporalStatus,
  selectActiveVerifiedRuleVersion,
} from '../../../src/modules/probabilities/rule-validity.ts';
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

    const referenceNow = new Date();

    const items = allLotteries.map((lottery) => {
      const rules = allRuleVersions.filter((r) => r.lotteryTypeId === lottery.id);
      const activeRule = selectActiveVerifiedRuleVersion(rules, referenceNow);
      return {
        ...lottery,
        specialEvents: allEvents.filter((e) => e.lotteryTypeId === lottery.id),
        ruleVersionsCount: rules.length,
        activeRuleVersionId: activeRule?.id ?? null,
        activeRuleSummary: activeRule
          ? {
              id: activeRule.id,
              versionNumber: activeRule.versionNumber,
              mathModelType: activeRule.mathModelType,
              numberUniverseMin: activeRule.numberUniverseMin,
              numberUniverseMax: activeRule.numberUniverseMax,
              drawnNumbersCount: activeRule.drawnNumbersCount,
              minNumbersToChoose: activeRule.minNumbersToChoose,
              maxNumbersToChoose: activeRule.maxNumbersToChoose,
              simpleBetPriceCents: activeRule.simpleBetPriceCents,
              priceUpdatedAt: activeRule.priceUpdatedAt,
              priceSource: activeRule.priceSource,
              prizeTiersConfig: activeRule.prizeTiersConfig,
              officialSource: activeRule.officialSource,
              validFrom: activeRule.validFrom,
              validTo: activeRule.validTo,
            }
          : null,
      };
    });

    const hasVerifiedActiveRules = items.some((item) => item.activeRuleVersionId !== null);

    return res.json({
      stage: 'etapa-2-motor-especializado',
      referenceDate: referenceNow.toISOString(),
      rulesVerified: hasVerifiedActiveRules,
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

    let referenceDate = new Date();
    const rawRefDate =
      typeof req.query.referenceDate === 'string' ? req.query.referenceDate.trim() : '';
    if (rawRefDate) {
      const parsedRef = new Date(rawRefDate);
      if (Number.isNaN(parsedRef.getTime())) {
        return res.status(400).json({
          error: 'INVALID_REFERENCE_DATE',
          message: 'Parâmetro referenceDate inválido. Utilize formato ISO-8601.',
        });
      }
      referenceDate = parsedRef;
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

    const ruleVersionsRaw = await db
      .select()
      .from(lotteryRuleVersions)
      .where(eq(lotteryRuleVersions.lotteryTypeId, lottery.id))
      .orderBy(asc(lotteryRuleVersions.versionNumber));

    const activeRule = selectActiveVerifiedRuleVersion(ruleVersionsRaw, referenceDate);
    const ruleVersions = ruleVersionsRaw.map((rule) => ({
      ...rule,
      temporalStatus: classifyRuleTemporalStatus(rule, referenceDate),
    }));

    return res.json({
      ...lottery,
      referenceDate: referenceDate.toISOString(),
      activeRuleVersionId: activeRule?.id ?? null,
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
