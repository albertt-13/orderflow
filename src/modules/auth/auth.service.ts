import bcrypt from "bcrypt";
import { ConflictError, UnauthorizedError } from "../../shared/errors/AppError.js";
import { signAccessToken, signRefreshToken } from "../../shared/auth/jwt.js";
import { authRepository } from "./auth.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

const BCRYPT_COST_FACTOR = 12;

export const authService = {
  async register({ email, password }: RegisterInput) {
    const existing = await authRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError("Ya existe un usuario con ese email");
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const user = await authRepository.create(email, hashedPassword);

    return {
      accessToken: signAccessToken({ userId: user.id, role: user.role }),
      refreshToken: signRefreshToken({ userId: user.id }),
    };
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

    return {
      accessToken: signAccessToken({ userId: user.id, role: user.role }),
      refreshToken: signRefreshToken({ userId: user.id }),
    };
  },
};
