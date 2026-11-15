import crypto from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import { auditLogs, users } from './schema.ts';

/**
 * Gera hash seguro utilizando scrypt + salt aleatório de 16 bytes.
 * Senhas nunca são armazenadas em texto simples.
 */
export function hashPassword(password: string): string {
  if (!password || password.length < 8) {
    throw new Error('A senha deve conter pelo menos 8 caracteres.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verifica senha usando comparação em tempo constante (timingSafeEqual).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex || keyHex.length !== 128) return false;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

/**
 * Sincroniza ou cria usuário autenticado via Firebase no PostgreSQL de forma idempotente.
 * Provisiona o primeiro `super_admin` somente se:
 *  1) `BOOTSTRAP_ADMIN_EMAIL` estiver configurado no servidor;
 *  2) O e-mail do token Firebase estiver verificado (`emailVerified === true`) e corresponder;
 *  3) Não existir nenhum `admin` ou `super_admin` cadastrado ainda no banco (transacional).
 */
export async function getOrCreateUser(
  uid: string,
  email: string,
  name?: string,
  emailVerified = false
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const safeName = name?.trim() || normalizedEmail.split('@')[0] || 'Usuário LOTUS';
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || '';

    const shouldAttemptBootstrap =
      Boolean(bootstrapEmail) && emailVerified && normalizedEmail === bootstrapEmail;

    return await db.transaction(async (tx) => {
      let targetRole: 'user' | 'super_admin' = 'user';

      if (shouldAttemptBootstrap) {
        const existingAdmins = await tx
          .select({ value: count() })
          .from(users)
          .where(inArray(users.role, ['admin', 'super_admin']));

        if (Number(existingAdmins[0]?.value ?? 0) === 0) {
          targetRole = 'super_admin';
        }
      }

      const upserted = await tx
        .insert(users)
        .values({
          uid,
          email: normalizedEmail,
          name: safeName,
          status: 'active',
          role: targetRole,
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email: normalizedEmail,
            updatedAt: new Date(),
            // Só promove usuário existente se ele for o alvo de bootstrap com 0 admins no sistema
            ...(targetRole === 'super_admin' ? { role: 'super_admin' } : {}),
          },
        })
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

      const user = upserted[0];

      if (targetRole === 'super_admin' && user.role === 'super_admin') {
        await tx.insert(auditLogs).values({
          actorUserId: user.id,
          actorUid: user.uid,
          operation: 'BOOTSTRAP_FIRST_ADMIN',
          targetEntity: 'users',
          targetId: String(user.id),
          changeDetails: {
            email: user.email,
            assignedRole: 'super_admin',
          },
        });
      }

      return user;
    });
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        name: users.name,
        email: users.email,
        status: users.status,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserByUid:', error);
    throw new Error('Failed to retrieve user profile.', { cause: error });
  }
}
