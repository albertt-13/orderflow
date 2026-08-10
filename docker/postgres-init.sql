-- Se corre una sola vez, cuando el volumen de Postgres está vacío (primer
-- "docker compose up" desde cero). Cada servicio tiene su propia base -
-- ningún servicio hace JOIN contra la base de otro.
CREATE DATABASE auth_db;
CREATE DATABASE inventory_db;
CREATE DATABASE orders_db;
