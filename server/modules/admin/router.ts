import { asc, desc } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../../src/db/index.ts';
import { auditLogs, dataSources } from '../../../src/db/schema.ts';
import { ensureInitialCatalogSeeded } from '../../../src/db/seed-catalog.ts';
import { requireAuth, requireRole, type AuthRequest } from '../../middleware/auth.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin', 'super_admin']));

adminRouter.get('/data-sources', async (req: AuthRequest, res) => {
  try {
    await ensureInitialCatalogSeeded();
    const sources = await db.select().from(dataSources).orderBy(asc(dataSources.id));

    await db.insert(auditLogs).values({
      actorUserId: req.dbUser?.id ?? null,
      actorUid: req.dbUser?.uid ?? null,
      operation: 'READ_DATA_SOURCES',
      targetEntity: 'data_sources',
      changeDetails: { count: sources.length },
      ipAddress: req.ip ?? null,
    });

    return res.json({
      total: sources.length,
      items: sources,
    });
  } catch (error) {
    console.error('Failed to fetch admin data sources:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Erro ao consultar fontes de dados oficiais.',
    });
  }
});

adminRouter.get('/audit-logs', async (_req: AuthRequest, res) => {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    return res.json({
      total: logs.length,
      items: logs,
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Erro ao consultar logs de auditoria.',
    });
  }
});
