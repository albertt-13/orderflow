import bcrypt from "bcrypt";
import { ConflictError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/auth/jwt.js";
import { authRepository } from "./auth.repository.js";
import { refreshTokenRepository } from "./refreshToken.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

const BCRYPT_COST_FACTOR = 12;

async function issueTokenPair(userId: string, role: string) {
  const refreshTokenRow = await refreshTokenRepository.create(userId);
  return {
    accessToken: signAccessToken({ userId, role }),
    refreshToken: signRefreshToken({ userId, tokenId: refreshTokenRow.id }),
  };
}

export const authService = {
  async register({ email, password }: RegisterInput) {
    const existing = await authRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError("Ya existe un usuario con ese email");
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const user = await authRepository.create(email, hashedPassword);

    return issueTokenPair(user.id, user.role);
  },

  async login({ email, password }: LoginInput) {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const passwordMatches = await bcrypt.compare(password, user.hashedPassword);
    if (!passwordMatches) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    return issueTokenPair(user.id, user.role);
  },

  async refresh(token: string) {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    const stored = await refreshTokenRepository.findById(payload.tokenId);
    if (!stored || stored.userId !== payload.userId) {
      throw new UnauthorizedError("Refresh token inválido");
    }

    if (stored.revokedAt) {
      // Alguien está reusando un refresh token que ya fue rotado: indicio de
      // robo de token. Por seguridad, se revocan TODOS los refresh tokens
      // activos del usuario, no solo este.
      await refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new UnauthorizedError("Refresh token inválido");
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expirado");
    }

    // Rotación: el refresh token usado queda inválido, se emite un par nuevo.
    await refreshTokenRepository.revoke(stored.id);

    const user = await authRepository.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedError("Usuario no encontrado");
    }

    return issueTokenPair(user.id, user.role);
  },
};
