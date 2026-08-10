import bcrypt from "bcrypt";
import { prisma } from "../src/infra/prisma.js";

const ADMIN_EMAIL = "admin@orderflow.com";
const ADMIN_PASSWORD = "admin12345";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    console.log("El admin de seed ya existe, no se recrea.");
    return;
  }

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      hashedPassword: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });

  console.log(`Admin creado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
