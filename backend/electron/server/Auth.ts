import crypto from 'node:crypto';

const tokenHeader = { alg: 'HS256', typ: 'JWT' };
const tokenTtlSeconds = 60 * 60 * 24 * 90;
const passwordIterations = 120_000;
const passwordKeyLength = 32;

interface TokenPayload {
  email: string;
  exp: number;
  iat: number;
  sub: string;
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, 'sha256')
    .toString('hex');

  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = crypto
    .pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, 'sha256')
    .toString('hex');
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createToken(secret: string, doctor: { email: string; id: string }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    email: doctor.email,
    exp: issuedAt + tokenTtlSeconds,
    iat: issuedAt,
    sub: doctor.id,
  };
  const unsignedToken = [
    base64UrlEncode(JSON.stringify(tokenHeader)),
    base64UrlEncode(JSON.stringify(payload)),
  ].join('.');

  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

export function verifyToken(secret: string, token: string): TokenPayload | null {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const unsignedToken = `${header}.${payload}`;
  const expectedSignature = sign(unsignedToken, secret);

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;

    if (!parsedPayload.sub || parsedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}
