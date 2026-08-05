import { Migration } from '@mikro-orm/migrations';

// Hand-written for the same reason as the migrations before it - the snapshot is behind the
// entities, so `migration:create` emits spurious `create table`s for tables that already exist.
//
// `down` drops the record of who has already been nudged. That cannot be reconstructed from
// Discord, so re-running `up` afterwards will nudge everyone in the backlog a second time.
export class Migration20260805143000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql('create table `onboarding_nudge_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `discord_nickname` varchar(255) not null, `nudged_at` datetime not null) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `onboarding_nudge_entity` add index `onboarding_nudge_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `onboarding_nudge_entity` add unique `onboarding_nudge_entity_discord_id_unique`(`discord_id`);');
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists `onboarding_nudge_entity`;');
  }

}
