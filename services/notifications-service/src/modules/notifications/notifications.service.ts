import { logger } from "../../infra/logger.js";
import { notificationsRepository } from "./notifications.repository.js";

interface NotifyParams {
  eventId: string;
  orderId: string;
  userId: string;
  type: "order.confirmed" | "order.cancelled";
  reason?: string;
}

export const notificationsService = {
  async notify(params: NotifyParams) {
    const message =
      params.type === "order.confirmed"
        ? `Tu orden ${params.orderId} fue confirmada. ¡Gracias por tu compra!`
        : `Tu orden ${params.orderId} fue cancelada${params.reason ? `: ${params.reason}` : ""}.`;

    logger.info(`📧 Email simulado a usuario ${params.userId}: ${message}`);

    await notificationsRepository.create({
      eventId: params.eventId,
      orderId: params.orderId,
      userId: params.userId,
      type: params.type,
      message,
    });
  },

  listForUser(userId: string) {
    return notificationsRepository.findByUser(userId);
  },
};
