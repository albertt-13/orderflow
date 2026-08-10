// Contratos tipados de los eventos de dominio que viajan por el exchange
// topic "orderflow.events". Cada bounded context (servicio) publica los
// eventos de SU dominio y consume los que le interesan de otros.
//
// Saga por coreografia (ver README): ningun servicio orquesta a los demas,
// cada uno reacciona a eventos y publica los propios.
//
//   orders-service: POST /orders -> order.created
//   inventory-service: consume order.created -> reserva stock
//                       -> stock.reserved | stock.rejected
//   orders-service: consume stock.reserved -> publica payment.requested
//                   consume stock.rejected -> publica order.cancelled
//   orders-service (consumer interno "payment simulado"):
//                   consume payment.requested -> payment.confirmed | payment.failed
//   orders-service: consume payment.confirmed -> order.confirmed
//                   consume payment.failed -> order.cancelled (compensacion)
//   inventory-service: consume order.cancelled -> libera el stock reservado
//   notifications-service: consume order.confirmed y order.cancelled -> "email"

export interface OrderItemRef {
  productId: string;
  quantity: number;
}

export interface OrderCreatedEvent {
  eventId: string;
  orderId: string;
  userId: string;
  items: OrderItemRef[];
  total: string;
  occurredAt: string;
}

export interface StockReservedEvent {
  eventId: string;
  orderId: string;
  occurredAt: string;
}

export interface StockRejectedEvent {
  eventId: string;
  orderId: string;
  reason: string;
  occurredAt: string;
}

export interface PaymentRequestedEvent {
  eventId: string;
  orderId: string;
  userId: string;
  total: string;
  occurredAt: string;
}

export interface PaymentConfirmedEvent {
  eventId: string;
  orderId: string;
  occurredAt: string;
}

export interface PaymentFailedEvent {
  eventId: string;
  orderId: string;
  reason: string;
  occurredAt: string;
}

export interface OrderConfirmedEvent {
  eventId: string;
  orderId: string;
  userId: string;
  occurredAt: string;
}

export interface OrderCancelledEvent {
  eventId: string;
  orderId: string;
  userId: string;
  reason: string;
  occurredAt: string;
}

export const ROUTING_KEYS = {
  ORDER_CREATED: "order.created",
  STOCK_RESERVED: "stock.reserved",
  STOCK_REJECTED: "stock.rejected",
  PAYMENT_REQUESTED: "payment.requested",
  PAYMENT_CONFIRMED: "payment.confirmed",
  PAYMENT_FAILED: "payment.failed",
  ORDER_CONFIRMED: "order.confirmed",
  ORDER_CANCELLED: "order.cancelled",
} as const;

export const EXCHANGE = "orderflow.events";
