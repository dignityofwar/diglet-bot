import { Migration } from '@mikro-orm/migrations';

export class Migration20240602234135 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `albion_registrations_entity` drop index `unique_discordId_characterId_characterName_guildId`;');
    this.addSql('alter table `albion_registrations_entity` add unique `unique_guild_discord`(`guild_id`, `discord_id`);');
    this.addSql('alter table `albion_registrations_entity` add unique `unique_guild_character`(`guild_id`, `character_id`);');
  }

  async down(): Promise<void> {
    this.addSql('alter table `albion_registrations_entity` add unique `unique_discordId_characterId_characterName_guildId`(`discord_id`, `character_id`, `character_name`, `guild_id`);');
    this.addSql('alter table `albion_registrations_entity` drop index `unique_guild_discord`;');
    this.addSql('alter table `albion_registrations_entity` drop index `unique_guild_character`;');
  }
}
