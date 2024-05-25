import { Command, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember } from 'discord.js';
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
    await interaction.reply('Finding the poor souls who are not onboarded...');
    const channel = interaction.channel;

    const message = await channel.send('Calculating purgable members...');

    const purgableMembers = await this.purgeService.getPurgableMembers(message);

    if (purgableMembers.purgableMembers.size === 0) {
      this.logger.log('All members are onboarded!');
      await channel.send('https://static1.srcdn.com/wordpress/wp-content/uploads/2019/02/Thanos-Soul-World-Sad-Face.jpg');
      await channel.send('All members are onboarded or are within grace period! They have been saved from Thanos, for now.');
      await channel.send(`Humans in grace period: **${purgableMembers.inGracePeriod}**`);
      await message.delete();
      return;
    }

    await message.edit(`Found ${purgableMembers.purgableMembers.size} members who are not onboarded. Generating list...`);

    // Hold a list of member IDs that will be sent by the below
    const gameMemberIds: string[] = [];

    // Loop through purgable members by game, batch sending the members in each game
    const purgableMembersBatched = [];
    for (const game in purgableMembers.purgableByGame) {
      if (purgableMembers.purgableByGame[game].size > 0) {
        const batch: string[] = [];
        purgableMembers.purgableByGame[game].each((member: GuildMember) => {
          batch.push(`- [${game.toUpperCase()}] <@${member.user.id}> / ${member.nickname || member.user.username}, joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`);
          gameMemberIds.push(member.user.id);
        });
        await channel.send(`## ${game.toUpperCase()}`);
        // Go through the batches by groups of 20 and spit out the members
        for (let i = 0; i < batch.length; i += 20) {
          const tempMessage = await channel.send('foo');
          await tempMessage.edit(`${batch.slice(i, i + 20).join('')}`);
        }
      }
    }

    // Now loop through the purgable members in its entirety, reference to the gameMemberIds array to see if the member has already been sent
    const batch: string[] = [];
    purgableMembers.purgableMembers.each((member: GuildMember) => {
      if (!gameMemberIds.includes(member.user.id)) {
        batch.push(`- [NONE] <@${member.user.id}> / ${member.nickname || member.user.username}, joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`);
      }
    });

    await channel.send('## No game role');

    // Go through the batches by groups of 20 and spit out the members
    for (let i = 0; i < batch.length; i += 20) {
      const tempMessage = await channel.send('foo');
      await tempMessage.edit(`${batch.slice(i, i + 20).join('')}`);
    }

    // Send the batches
    for (let k = 0; k < purgableMembersBatched.length; k++) {
      const tempMessage = await channel.send('foo');
      await tempMessage.edit(purgableMembersBatched[k]);
    }

    this.logger.log(`Found ${purgableMembersBatched.length} batches of 20 members who are not onboarded. Sending batches...`);

    const percent = Math.floor((purgableMembers.purgableMembers.size / purgableMembers.totalHumans) * 100);

    await channel.send(`List complete.\n 
- Total members: **${purgableMembers.totalMembers}**
- Total bots: **${purgableMembers.totalBots}**
- Total humans: **${purgableMembers.totalHumans}**
- Total humans in 1 week grace period: **${purgableMembers.inGracePeriod}**
- Total human members who are not onboarded: **${purgableMembers.purgableMembers.size}** (${percent}%)

## Game stats
Note, these numbers will not add up to total numbers, as a member can be in multiple games.

- Total PS2 kicked: **${purgableMembers.purgableByGame.ps2.size}**
- Total PS2 verified kicked: **${purgableMembers.purgableByGame.ps2Verified.size}**
- Total Foxhole kicked: **${purgableMembers.purgableByGame.foxhole.size}**
- Total Albion kicked: **${purgableMembers.purgableByGame.albion.size}**
- Total ALB Registered kicked: **${purgableMembers.purgableByGame.albionUSRegistered.size}**`
    );

    this.logger.log('All batches sent.');
    this.logger.log(`Identified ${purgableMembers.purgableMembers.size} members are not onboarded.`);
  }
}
