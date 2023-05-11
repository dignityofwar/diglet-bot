import {Client, CommandInteraction, ApplicationCommandType} from "discord.js";
import { CommandInterface } from "../interfaces/CommandInterface";

export const HelloCommand: CommandInterface = {
    name: "hello",
    description: "Returns a greeting",
    type: ApplicationCommandType.ChatInput,
    run: async (client: Client, interaction: CommandInteraction) => {
        const content = "Hello there!";

        await interaction.followUp({
            ephemeral: true,
            content
        });
    }
};
