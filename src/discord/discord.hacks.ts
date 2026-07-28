import { ChatInputCommandInteraction, GuildTextBasedChannel, Message } from 'discord.js';

// Type re-case to stop discord.js from complaining about the type. We only ever use Guild Text Channels anyway.
export const getChannel = (message: Message): GuildTextBasedChannel => {
  return message.channel as GuildTextBasedChannel;
};

// necord discards whatever a command handler returns, so every reply has to be explicit.
// Handing the content back keeps handlers readable as `return replyTo(...)`.
export const replyTo = async (
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<string> => {
  await interaction.reply(content);
  return content;
};
