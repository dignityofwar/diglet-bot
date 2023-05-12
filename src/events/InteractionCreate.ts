import { Client, CommandInteraction, Interaction } from 'discord.js';
import { Commands } from '../commands';

export default class InteractionCreate {
    private readonly client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    public async handle(interaction: Interaction): Promise<void> {
        if (interaction.isCommand()) {
            await this.handleSlashCommand(interaction as CommandInteraction);
        }
    }

    private async handleSlashCommand(interaction: CommandInteraction): Promise<void> {
        const slashCommand = Commands.find(c => c.name === interaction.commandName);

        if (!slashCommand) {
            await interaction.followUp({ content: 'An error has occurred! Please report this to @Maelstrome26. Error: Command is not slash command.' });
            return;
        }

        await interaction.deferReply();

        slashCommand.run(this.client, interaction);
    }
}
