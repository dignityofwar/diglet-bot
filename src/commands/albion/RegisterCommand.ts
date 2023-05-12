import { Client, CommandInteraction, ApplicationCommandType } from 'discord.js';
import { CommandInterface } from '../../interfaces/CommandInterface';
import { PrismaClient } from '@prisma/client';
import AxiosFactory from '../../factories/AxiosFactory';
import { PlayersResponseInterface, SearchResponseInterface } from '../../interfaces/ToolsForAlbionInterface';
import { AlbionConsts } from '../../consts/AlbionConsts';

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
        if (!await checkIfRegistrationChannel(interaction)) {
            return;
        }

        // Character name
        const characterName = interaction.options.data.find((option) => option.name === 'character-name')?.value ?? null;

        // This shouldn't happen as it's required but anyway
        if (!characterName) {
            await interaction.followUp({
                ephemeral: true,
                content: 'Please provide your Albion Online character name.',
            });
            return;
        }

        // Get the character
        const character = await pullCharacter(String(characterName));

        // Get guild ID
        const guildId = await getGuildId();

        // Check if the character is in the guild
        if (!character.data.GuildId || character.data.GuildId !== guildId) {
            await interaction.followUp({
                ephemeral: true,
                content: 'Your character is not in the guild. If you are in the guild, please try again in a few hours as our data source may be out of date.',
            });
            return;
        }

        // Get the guild member to be able to edit things about them
        const guildMember = await interaction.guild?.members.fetch(interaction.user.id);

        // Edit their nickname to match their ingame
        try {
            await guildMember?.setNickname(character.data.Name);
        }
        catch (err) {
            await interaction.followUp({
                ephemeral: false,
                content: 'Unable to set your nickname. Please contact an admin.',
            });
            return false;
        }

        // Add the initiate role
        const initiateRoleId = await getInitiateRoleId();
        const initiateRole = await interaction.guild?.roles.fetch(initiateRoleId);

        console.log('role', initiateRole, 'id', initiateRoleId);

        if (!initiateRole) {
            await interaction.followUp({
                ephemeral: false,
                content: 'Unable to find the initiate role. Please contact an admin.',
            });
            return false;
        }
        try {
            await guildMember?.roles.add(initiateRole);
        }
        catch (err) {
            await interaction.followUp({
                ephemeral: false,
                content: 'Unable to add the initiate role. Please contact an admin.',
            });
            return false;
        }

        await interaction.followUp({
            ephemeral: false,
            content: `Thank you ${characterName}, you've been verified as a [DIG] guild member! Please read the information within <#1039269859814559764> to be fully acquainted with the guild! Don't forget to grab roles for areas of interest in the "Channels & Roles" menu right at the top of this server!`,
        });
    },
};

const getGuildId = (async (): Promise<string> => {
    const prisma = new PrismaClient();

    const guildId = await prisma.config.findUnique({
        where: { key: AlbionConsts.guildIdKey },
    });

    if (!guildId || !guildId.value || guildId.value === '') {
        throw new Error('Guild ID not set.');
    }

    return guildId.value;
});

const getInitiateRoleId = (async (): Promise<string> => {
    const prisma = new PrismaClient();

    const roleId = await prisma.config.findUnique({
        where: { key: AlbionConsts.initiateRoleIdKey },
    });

    if (!roleId || !roleId.value || roleId.value === '') {
        throw new Error('Role ID not set.');
    }

    return roleId.value;
});

const checkIfRegistrationChannel = (async (interaction: CommandInteraction): Promise<boolean> => {
    const prisma = new PrismaClient();

    // Check if the command came from the correct channel ID
    const channelIdFrom = interaction.channelId;
    const channelIdRow = await prisma.config.findUnique({
        where: { key: 'albionOnline:registrationChannelId' },
    });

    const channelId = channelIdRow?.value ?? '';

    if (channelId && channelIdFrom !== channelId) {
        await interaction.followUp({
            ephemeral: true,
            content: `Please use this command in channel <#${channelId}> to register for Albion Online.`,
        });
        return false;
    }
    return true;
});

const pullCharacter = async (characterName: string): Promise<PlayersResponseInterface> => {
    const characterId = await findCharacterId(characterName);

    const request = new AxiosFactory().createT4AClient();
    const response: PlayersResponseInterface = await request.get(`/players/${characterId}`);

    if (response.data.Id !== characterId) {
        throw new Error('Character ID does not match.');
    }

    return response;
};

const findCharacterId = async (characterName: string): Promise<string> => {
    const request = new AxiosFactory().createT4AClient();
    const response: SearchResponseInterface = await request.get(`/search?q=${characterName}`);

    // Loop through the players response to find the character name
    const foundPlayer = response.data.players.filter((player) => {
        if (player.Name === characterName) {
            return true;
        }
        return false;
    });

    // There should only be one
    if (foundPlayer.length !== 1) {
        throw new Error('Found more than one player with the same name. Please supply your exact name');
    }

    // Check if the name matches
    if (foundPlayer[0].Name !== characterName) {
        throw new Error('Player not found. Please ensure you have supplied your exact name.');
    }

    return foundPlayer[0].Id;
};
