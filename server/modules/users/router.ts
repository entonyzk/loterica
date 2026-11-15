import { count, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.ts';
import { analysisHistory, simulations, userBets, users } from '../../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';

export const usersRouter = Router();

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

function sanitizeProfile(dbUser: NonNullable<AuthRequest['dbUser']>) {
  return {
    id: dbUser.id,
    uid: dbUser.uid,
    name: dbUser.name,
    email: dbUser.email,
    status: dbUser.status,
    role: dbUser.role,
    createdAt: dbUser.createdAt,
    updatedAt: dbUser.updatedAt,
  };
}

usersRouter.get('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser;
    if (!dbUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Usuário não autenticado.',
      });
    }

    const [analysesCountRows, simulationsCountRows, betsCountRows] = await Promise.all([
      db.select({ value: count() }).from(analysisHistory).where(eq(analysisHistory.userId, dbUser.id)),
      db.select({ value: count() }).from(simulations).where(eq(simulations.userId, dbUser.id)),
      db.select({ value: count() }).from(userBets).where(eq(userBets.userId, dbUser.id)),
    ]);

    return res.json({
      profile: sanitizeProfile(dbUser),
      activitySummary: {
        analysesCount: Number(analysesCountRows[0]?.value ?? 0),
        simulationsCount: Number(simulationsCountRows[0]?.value ?? 0),
        betsCount: Number(betsCountRows[0]?.value ?? 0),
      },
    });
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Não foi possível carregar o perfil do usuário.',
    });
  }
});

usersRouter.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res) => {
    try {
      const dbUser = req.dbUser;
      if (!dbUser) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
        });
      }

      const { name } = req.body as z.infer<typeof updateProfileSchema>;

      const updated = await db
        .update(users)
        .set({
          name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, dbUser.id))
        .returning({
          id: users.id,
          uid: users.uid,
          name: users.name,
          email: users.email,
          status: users.status,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return res.json({
        profile: updated[0],
      });
    } catch (error) {
      console.error('Failed to update user profile:', error);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Não foi possível atualizar o perfil do usuário.',
      });
    }
  }
);

/**
 * Rota com parâmetro explícito para garantir isolamento estrito entre contas.
 * Um usuário autenticado nunca pode consultar ou alterar dados privados de outro ID.
 */
usersRouter.get('/:userId/profile', requireAuth, async (req: AuthRequest, res) => {
  const dbUser = req.dbUser;
  if (!dbUser) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Usuário não autenticado.',
    });
  }

  const requestedId = Number(req.params.userId);
  if (!Number.isInteger(requestedId) || requestedId <= 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Identificador de usuário inválido.',
    });
  }

  if (requestedId !== dbUser.id) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Acesso negado: usuários não podem consultar dados privados de outras contas.',
    });
  }

  return res.json({
    profile: sanitizeProfile(dbUser),
  });
});
