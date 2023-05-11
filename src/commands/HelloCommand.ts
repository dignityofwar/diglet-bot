import {Client, CommandInteraction, ApplicationCommandType} from 'discord.js'
import {CommandInterface} from '../interfaces/CommandInterface'
import _ from 'lodash'

export const HelloCommand: CommandInterface = {
    name: 'hello',
    description: 'Returns a greeting',
    type: ApplicationCommandType.ChatInput,
    run: async (client: Client, interaction: CommandInteraction) => {
        const names = ['Bob', 'Charlie', 'Matt', 'Rob', 'Caroline', 'Edda']

        const content = `${_.sample(names)} says hello, ${client.user?.username}!`

        await interaction.followUp({
            ephemeral: true,
            content
        })
    }
}
