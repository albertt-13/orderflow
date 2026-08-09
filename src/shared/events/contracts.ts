// Contratos tipados de eventos de dominio, publicados en el exchange
// "orderflow.events". En Fase 4 (microservicios) esto se muda a
// packages/shared para que todos los servicios importen el mismo tipo.

export interface OrderCreatedEvent {
  eventId: string;
  orderId: string;
  userId: string;
  items: { productId: string; quantity: number }[];
  total: string;
  occurredAt: string;
}

export interface OrderCancelledEvent {
  eventId: string;
  orderId: string;
  userId: string;
  occurredAt: string;
}

export const ROUTING_KEYS = {
  ORDER_CREATED: "order.created",
  ORDER_CANCELLED: "order.cancelled",
} as const;
