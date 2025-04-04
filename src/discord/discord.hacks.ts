import { GuildTextBasedChannel, Message } from 'discord.js';

// Type re-case to stop discord.js from complaining about the type. We only ever use Guild Text Channels anyway.
export const getChannel = (message: Message) => {
  return message.channel as GuildTextBasedChannel;
};