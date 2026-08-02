import {
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  Message,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';

// Type re-case to stop discord.js from complaining about the type. We only ever use Guild Text Channels anyway.
export const getChannel = (message: Message): GuildTextBasedChannel => {
  return message.channel as GuildTextBasedChannel;
};

// necord discards whatever a command handler returns, so every reply has to be explicit.
// Handing the content back keeps handlers readable as `return replyTo(...)`.
// Deferred interactions must be edited rather than replied to, or discord.js throws.
export const replyTo = async (
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<string> => {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content);
  }
  else {
    await interaction.reply(content);
  }
  return content;
};

// Reactions and users arrive partial when the message predates the cache, which is the norm
// for anything older than a restart. Resolves only the event's own pair - a full recount of
// every reactor needs reaction.users.fetch() as well.
export const resolvePartialReaction = async (
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<{ reaction: MessageReaction, user: User }> => {
  const realReaction = reaction.partial ? await reaction.fetch() : reaction as MessageReaction;
  const realUser = user.partial ? await user.fetch() : user as User;

  return { reaction: realReaction, user: realUser };
};
