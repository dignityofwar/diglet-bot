import { PrismaClient } from '@prisma/client';

export const getConfig = async (key: string): Promise<string> => {
    const prismaClient = new PrismaClient();

    const result = await prismaClient.config.findFirstOrThrow({
        where: { key: key },
    });

    if (!result || !result.value) {
        throw new Error('Config item not found!');
    }
    return result.value;
};
