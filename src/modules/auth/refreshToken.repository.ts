import { randomUUID } from "node:crypto";
import { redis } from "../../infra/redis.js";

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function key(userId: string, tokenId: string) {
  return `refresh:${userId}:${tokenId}`;
}

export const refreshTokenRepository = {
  async create(userId: string) {
    const tokenId = randomUUID();
    await redis.set(key(userId, tokenId), "active", "EX", REFRESH_TOKEN_TTL_SECONDS);
    return tokenId;
  },

  async getStatus(userId: string, tokenId: string): Promise<"active" | "revoked" | "missing"> {
    const value = await redis.get(key(userId, tokenId));
    if (value === "active" || value === "revoked") return value;
    return "missing";
  },

  /**
   * Rotacion: marca el token como usado pero preserva el TTL restante
   * (SET ... KEEPTTL) en vez de borrarlo. Si alguien vuelve a presentar este
   * mismo token despues de rotado, todavia lo encontramos como "revoked" y
   * podemos reaccionar (robo de token) en vez de que simplemente "no exista".
   */
  revokeForRotation(userId: string, tokenId: string) {
    return redis.set(key(userId, tokenId), "revoked", "KEEPTTL");
  },

  logoutOne(userId: string, tokenId: string) {
    return redis.del(key(userId, tokenId));
  },

  async deleteAllForUser(userId: string) {
    const keys = await redis.keys(`refresh:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
