import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const albionRegistrationChannel = {
        key: 'albionOnline:registrationChannelId',
        value: '1106632012615397457',
    };
    await prisma.config.upsert({
        where: { key: albionRegistrationChannel.key },
        update: {},
        create: {
            key: albionRegistrationChannel.key,
            value: albionRegistrationChannel.value,
        },
    });
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
