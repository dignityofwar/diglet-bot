import { PrismaClient } from '@prisma/client';

export default class ConfigSeed {
    constructor(private readonly prismaClient: PrismaClient) {}

    public async seed(): Promise<void> {
        const albionRegistrationChannel = {
            key: 'albionOnline:registrationChannelId',
            value: '1039269295735181413',
        };
        await this.prismaClient.config.upsert({
            where: { key: albionRegistrationChannel.key },
            update: {},
            create: albionRegistrationChannel,
        });
    }
}
