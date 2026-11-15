import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../../src/lib/firebase-admin.ts';
import { getOrCreateUser } from '../../src/db/users.ts';

export type UserRole = 'user' | 'analyst' | 'admin' | 'super_admin';

export interface AuthenticatedDbUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: AuthenticatedDbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token de autenticação ausente ou malformado.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token de autenticação vazio.',
    });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken.uid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token sem identificador de usuário válido.',
      });
    }

    req.user = decodedToken;

    const email = decodedToken.email ?? `${decodedToken.uid}@no-email.local`;
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      email,
      decodedToken.name,
      decodedToken.email_verified === true
    );

    if (dbUser.status === 'suspended') {
      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Esta conta encontra-se suspensa pelo administrador.',
      });
    }

    req.dbUser = dbUser;
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token de autenticação inválido ou expirado.',
    });
  }
};

export const requireRole = (allowedRoles: ReadonlyArray<UserRole>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Autenticação obrigatória para acessar este recurso.',
      });
    }

    if (!allowedRoles.includes(req.dbUser.role as UserRole)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Nível de acesso insuficiente para executar esta operação.',
      });
    }

    return next();
  };
};
