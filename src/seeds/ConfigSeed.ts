import { PrismaClient } from '@prisma/client';
import { AlbionConsts } from '../consts/AlbionConsts';

export default class ConfigSeed {
    constructor(private readonly prismaClient: PrismaClient) {}

    public async seed(): Promise<void> {
        const albionRegistrationChannel = {
            key: AlbionConsts.registrationChannelIdKey,
            value: '1039269295735181413',
        };
        await this.prismaClient.config.upsert({
            where: { key: albionRegistrationChannel.key },
            update: {},
            create: albionRegistrationChannel,
        });

        const albionGuildId = {
            key: AlbionConsts.guildIdKey,
            value: 'btPZRoLvTUqLC7URnDRgSQ',
        };
        await this.prismaClient.config.upsert({
            where: { key: albionGuildId.key },
            update: {},
            create: albionGuildId,
        });

        const albionIntiateRoleId = {
            key: AlbionConsts.initiateRoleIdKey,
            value: '1076193105868501112',
        };
        await this.prismaClient.config.upsert({
            where: { key: albionIntiateRoleId.key },
            update: {},
            create: albionIntiateRoleId,
        });
    }
}
