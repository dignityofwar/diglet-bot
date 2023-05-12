import { Client, CommandInteraction, ApplicationCommandType } from 'discord.js';
import { CommandInterface } from '../../interfaces/CommandInterface';
import { PrismaClient } from '@prisma/client';

export const RegisterCommand: CommandInterface = {
    name: 'albion-register',
    description: 'Registers you with the DIG Albion Online guild.',
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: 'character-name',
            description: 'Your Albion in-game character name',
            type: 3,
            minLength: 3,
            maxLength: 16,
            required: true,
        },
    ],
    run: async (client: Client, interaction: CommandInteraction) => {
        const valid = await checkIfRegistrationChannel(interaction);

        if (!valid) {
            return;
        }

        await interaction.followUp({
            ephemeral: false,
            content: 'It was the right channel!',
        });
    },
};

const checkIfRegistrationChannel = (async (interaction: CommandInteraction): Promise<boolean> => {
    const prisma = new PrismaClient();

    // Check if the command came from the correct channel ID
    const channelIdFrom = interaction.channelId;
    const channelId = await prisma.config.findUnique({
        where: { key: 'albionOnline:registrationChannelId' },
    });

    if (channelId && channelIdFrom !== channelId.value) {
        await interaction.followUp({
            ephemeral: true,
            content: 'Please use the correct channel to register for Albion Online.',
        });
        return false;
    }
    return true;
});
