import { Client, CommandInteraction, ApplicationCommandType } from 'discord.js';
import { CommandInterface } from '../interfaces/CommandInterface';

export const PingCommand: CommandInterface = {
    name: 'ping',
    description: 'Returns a message from the bot verifying it is online.',
    type: ApplicationCommandType.ChatInput,
    run: async (client: Client, interaction: CommandInteraction) => {
        // e.g. "Hello Maelstrome26, I'm alive!"
        const content = `Hello ${interaction.user.username}, I'm alive!`;

        await interaction.followUp({
            ephemeral: true,
            content,
        });
    },
};
