import { prisma } from "../../infra/prisma.js";

export const reservationRepository = {
  findByOrderId(orderId: string) {
    return prisma.stockReservation.findMany({ where: { orderId } });
  },
};
