import { PrismaClient } from '@prisma/client';
import ConfigSeed from './seeds/ConfigSeed';

const prisma = new PrismaClient();

async function main() {
    await new ConfigSeed(prisma).seed();
}
main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
