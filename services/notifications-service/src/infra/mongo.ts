import { MongoClient } from "mongodb";
import { env } from "../shared/config/env.js";
import { logger } from "./logger.js";

export const mongoClient = new MongoClient(env.MONGODB_URL);

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
