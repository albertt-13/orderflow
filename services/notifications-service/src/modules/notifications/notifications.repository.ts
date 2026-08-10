import { getNotificationsCollection } from "../../infra/mongo.js";

export interface NotificationDoc {
  eventId: string;
  orderId: string;
  userId: string;
  type: "order.confirmed" | "order.cancelled";
  message: string;
  sentAt: Date;
}

export const notificationsRepository = {
  async create(doc: Omit<NotificationDoc, "sentAt">) {
    await getNotificationsCollection().insertOne({ ...doc, sentAt: new Date() });
  },

  findByUser(userId: string) {
    return getNotificationsCollection().find({ userId }).sort({ sentAt: -1 }).limit(50).toArray();
  },
};
