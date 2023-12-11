import { Command, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, Guild, GuildMember } from 'discord.js';
import { Logger } from '@nestjs/common';
import { PurgeService } from '../services/purge.service';

@Command({
  name: 'purge-candidates',
  type: ApplicationCommandType.ChatInput,
  description: 'Get a list of members who are not onboarded',
})
export class PurgeCandidatesCommand {
  private readonly logger = new Logger(PurgeCandidatesCommand.name);

  constructor(
    private readonly purgeService: PurgeService,
  ) {}

  @Handler()
  async onPurgeCandidatesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('Executing purge command...');

    const message = await interaction.channel.send('Calculating purgable members...');

    const purgableMembers = await this.purgeService.getPurgableMembers(message);

    if (purgableMembers.purgableMembers.size === 0) {
      this.logger.log('All members are onboarded!');
      await interaction.channel.send('All members are onboarded!');
      return;
    }

    await message.edit(`Found ${purgableMembers.purgableMembers.size} members who are not onboarded. Generating list...`);
    purgableMembers.purgableMembers.each((member: GuildMember) => {
      console.log(member.user);
    });

    // Loop through the members and send them in batches of 20, appending the .id of each member to a concatenated string to be sent in batches
    const purgableMembersBatched = [];
    let batch = '';
    let remaining = purgableMembers.purgableMembers.size;
    let i = 0;
    purgableMembers.purgableMembers.each((member: GuildMember) => {
      i++;
      remaining--;
      batch += `- <@${member.user.id}> / ${member.nickname || member.user.username},  joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`;

      if (i % 20 === 0 || remaining === 0) {
        purgableMembersBatched.push(batch);
        batch = '';
      }
    });

    // Send the batches
    for (let k = 0; k < purgableMembersBatched.length; k++) {
      const tempMessage = await interaction.channel.send('foo');
      await tempMessage.edit(purgableMembersBatched[k]);
    }

    this.logger.log(`Found ${purgableMembersBatched.length} batches of 20 members who are not onboarded. Sending batches...`);

    const percent = Math.floor((purgableMembers.purgableMembers.size / purgableMembers.totalHumans) * 100);

    await interaction.channel.send(`List complete.\n 
- Total members: **${purgableMembers.totalMembers}**
- Total bots: **${purgableMembers.totalBots}**
- Total humans: **${purgableMembers.totalHumans}**
- Total human members who are not onboarded: **${purgableMembers.purgableMembers.size}** (${percent}%)`);

    this.logger.log('All batches sent.');
    this.logger.log(`Identified ${purgableMembers.purgableMembers.size} members are not onboarded.`);
  }
}
