import { prisma } from "../../infra/prisma.js";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const refreshTokenRepository = {
  create(userId: string) {
    return prisma.refreshToken.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
  },

  findById(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  revoke(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
