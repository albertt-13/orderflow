import dns from "node:dns";
import { MongoClient } from "mongodb";
import { env } from "../shared/config/env.js";
import { logger } from "./logger.js";

// Node 18+ prefiere IPv6 cuando ambos están disponibles (Happy Eyeballs). En
// Render el egress IPv6 rompe a mitad del handshake TLS contra Atlas (alerta
// SSL genérica, no un simple connection refused) - forzar IPv4 lo evita.
dns.setDefaultResultOrder("ipv4first");

// family: 4 fuerza IPv4 a nivel de socket, ademas del dns.setDefaultResultOrder
// de arriba - el driver de Mongo no siempre respeta la preferencia global de
// Node para las conexiones que abre internamente.
export const mongoClient = new MongoClient(env.MONGODB_URL, { family: 4 });

let connected = false;

export async function connectMongo() {
  if (connected) return;
  await mongoClient.connect();
  connected = true;
  logger.info("mongodb: conectado");
}

export function getNotificationsCollection() {
  return mongoClient.db().collection("notifications");
}

export function pingMongo() {
  return mongoClient.db().command({ ping: 1 });
}
