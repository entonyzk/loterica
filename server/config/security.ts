import type { CorsOptions } from 'cors';
import type { HelmetOptions } from 'helmet';

export class CorsForbiddenError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'CORS_ORIGIN_FORBIDDEN';

  constructor(origin: string) {
    super(`Origem não autorizada pela política CORS: ${origin}`);
    this.name = 'CorsForbiddenError';
  }
}

export function getAllowedOrigins(isProd: boolean): string[] {
  const configured = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const appUrl = process.env.APP_URL?.trim();
  const validAppUrl =
    appUrl && appUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(appUrl)
      ? [appUrl.replace(/\/+$/, '')]
      : [];

  if (isProd) {
    return Array.from(new Set([...configured, ...validAppUrl]));
  }

  return Array.from(
    new Set([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...configured,
      ...validAppUrl,
    ])
  );
}

export function buildCorsOptions(isProd: boolean): CorsOptions {
  const allowedOrigins = getAllowedOrigins(isProd);

  return {
    origin(requestOrigin, callback) {
      // Requisições same-origin ou server-to-server sem cabeçalho Origin
      if (!requestOrigin) {
        return callback(null, true);
      }

      const normalized = requestOrigin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) {
        return callback(null, true);
      }

      return callback(new CorsForbiddenError(requestOrigin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

export function buildHelmetOptions(isProd: boolean): HelmetOptions {
  return {
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProd
          ? ["'self'", 'https://apis.google.com']
          : ["'self'", "'unsafe-inline'", 'https://apis.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://www.googleapis.com',
        ],
        frameSrc: [
          "'self'",
          'https://*.firebaseapp.com',
          'https://accounts.google.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  };
}
