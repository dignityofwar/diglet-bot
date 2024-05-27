import { Migration } from '@mikro-orm/migrations';

export class Migration20240423213351 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `albion_guild_members_entity` modify `registered` varchar(255) not null default false, modify `warned` varchar(255) not null default false;');

    this.addSql('alter table `albion_registrations_entity` add `guild_id` varchar(255) not null;');
    this.addSql('alter table `albion_registrations_entity` modify `manual` varchar(255) not null default false;');
    this.addSql('alter table `albion_registrations_entity` drop index `albion_members_entity_discord_id_unique`;');
    this.addSql('alter table `albion_registrations_entity` drop index `albion_members_entity_character_id_unique`;');
    this.addSql('alter table `albion_registrations_entity` add unique `unique_discordId_characterId_characterName_guildId`(`discord_id`, `character_id`, `character_name`, `guild_id`);');
    this.addSql('alter table `albion_registrations_entity` rename index `albion_members_entity_discord_id_index` to `albion_registrations_entity_discord_id_index`;');
    this.addSql('alter table `albion_registrations_entity` rename index `albion_members_entity_character_id_index` to `albion_registrations_entity_character_id_index`;');

    this.addSql('alter table `ps2members_entity` modify `manual` varchar(255) not null default false;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `albion_registrations_entity` modify `manual` varchar(255) not null default \'0\';');
    this.addSql('alter table `albion_registrations_entity` drop index `unique_discordId_characterId_characterName_guildId`;');
    this.addSql('alter table `albion_registrations_entity` drop `guild_id`;');
    this.addSql('alter table `albion_registrations_entity` add unique `albion_members_entity_discord_id_unique`(`discord_id`);');
    this.addSql('alter table `albion_registrations_entity` add unique `albion_members_entity_character_id_unique`(`character_id`);');
    this.addSql('alter table `albion_registrations_entity` rename index `albion_registrations_entity_discord_id_index` to `albion_members_entity_discord_id_index`;');
    this.addSql('alter table `albion_registrations_entity` rename index `albion_registrations_entity_character_id_index` to `albion_members_entity_character_id_index`;');

    this.addSql('alter table `ps2members_entity` modify `manual` varchar(255) not null default \'0\';');

    this.addSql('alter table `albion_guild_members_entity` modify `registered` varchar(255) not null default \'0\', modify `warned` varchar(255) not null default \'0\';');
  }

}
