import { prisma } from "../../infra/prisma.js";

export const authRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  create(email: string, hashedPassword: string) {
    return prisma.user.create({ data: { email, hashedPassword } });
  },
};
