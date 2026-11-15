import type { CorsOptions, CorsOptionsDelegate } from 'cors';
import type { Request } from 'express';
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
    .map((o) => o.trim().replace(/\/+$/, ''))
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

export function buildCorsOptionsDelegate(isProd: boolean): CorsOptionsDelegate<Request> {
  const allowedOrigins = getAllowedOrigins(isProd);

  return (req, callback) => {
    const host = req.get('host');
    const protocol = req.protocol || 'http';
    const sameOriginHost = host ? [`${protocol}://${host}`, `https://${host}`] : [];

    const options: CorsOptions = {
      origin(requestOrigin, originCb) {
        if (!requestOrigin) {
          return originCb(null, true);
        }

        const normalized = requestOrigin.replace(/\/+$/, '');
        if (allowedOrigins.includes(normalized) || sameOriginHost.includes(normalized)) {
          return originCb(null, true);
        }

        return originCb(new CorsForbiddenError(requestOrigin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    };

    callback(null, options);
  };
}

export function buildHelmetOptions(isProd: boolean): HelmetOptions {
  return {
    // Permite exibição segura no iframe do AI Studio e substitui X-Frame-Options por CSP frame-ancestors
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProd
          ? ["'self'", 'https://apis.google.com', 'https://www.gstatic.com']
          : ["'self'", "'unsafe-inline'", 'https://apis.google.com', 'https://www.gstatic.com'],
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
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.google.com'],
        ...(isProd ? {} : { upgradeInsecureRequests: null }),
      },
    },
  };
}
