import { Migration } from '@mikro-orm/migrations';

// Hand-written for the same reason as Migration20260728012034 and Migration20260730193000 - the
// snapshot is behind the entities, so `migration:create` emits spurious `create table`s.
//
// Statement order matters: migrations run non-transactional here, so the three new tables come
// first (each independently re-runnable after dropping a partial) and the alter on the populated
// albion_registrations_entity comes last.
//
// The `down` is destructive in a way a normal `drop column` is not. It discards rank dates that
// cannot be reconstructed from Discord, minute-sampled activity history that cannot be
// regenerated, and any open ballot still live in Judgement Hall. Close open votes by hand first.
export class Migration20260802120000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql('create table `member_daily_activity_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `date` datetime not null, `messages_sent` int not null default 0, `reactions_added` int not null default 0, `voice_minutes` int not null default 0) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `member_daily_activity_entity` add index `member_daily_activity_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `member_daily_activity_entity` add index `member_daily_activity_entity_date_index`(`date`);');
    this.addSql('alter table `member_daily_activity_entity` add unique `unique_member_day`(`discord_id`, `date`);');

    this.addSql('create table `member_daily_game_activity_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `date` datetime not null, `game_name` varchar(128) not null, `minutes` int not null default 0) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `member_daily_game_activity_entity` add index `member_daily_game_activity_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `member_daily_game_activity_entity` add index `member_daily_game_activity_entity_date_index`(`date`);');
    this.addSql('alter table `member_daily_game_activity_entity` add index `member_daily_game_activity_entity_game_name_index`(`game_name`);');
    this.addSql('alter table `member_daily_game_activity_entity` add unique `unique_member_day_game`(`discord_id`, `date`, `game_name`);');

    this.addSql('create table `albion_rank_up_vote_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `message_id` varchar(255) null default null, `channel_id` varchar(255) not null, `discord_id` varchar(255) not null, `pending_key` varchar(255) null default null, `character_name` varchar(255) not null, `from_rank` varchar(255) not null, `to_rank` varchar(255) not null, `required_score` double not null, `electorate_size` int not null, `status` varchar(255) not null default \'pending\', `expires_at` datetime not null, `score` double not null default 0, `provisional_status` varchar(255) null default null, `provisional_since` datetime null default null, `provisional_note` varchar(512) null default null, `resolved_at` datetime null default null, `announced_at` datetime null default null, `resolution_note` varchar(512) null default null) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `albion_rank_up_vote_entity` add index `albion_rank_up_vote_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `albion_rank_up_vote_entity` add index `albion_rank_up_vote_entity_status_index`(`status`);');
    this.addSql('alter table `albion_rank_up_vote_entity` add index `albion_rank_up_vote_entity_expires_at_index`(`expires_at`);');
    this.addSql('alter table `albion_rank_up_vote_entity` add index `albion_rank_up_vote_entity_provisional_since_index`(`provisional_since`);');
    this.addSql('alter table `albion_rank_up_vote_entity` add unique `albion_rank_up_vote_entity_message_id_unique`(`message_id`);');
    // Unique indexes ignore nulls, so this enforces one open ballot per member while allowing
    // any number of resolved rows
    this.addSql('alter table `albion_rank_up_vote_entity` add unique `albion_rank_up_vote_entity_pending_key_unique`(`pending_key`);');

    this.addSql('alter table `albion_registrations_entity` add `graduate_since` datetime null default null, add `adept_since` datetime null default null, add `last_rank_up_request_at` datetime null default null, add `last_denial_notice_at` datetime null default null;');
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `albion_registrations_entity` drop column `graduate_since`, drop column `adept_since`, drop column `last_rank_up_request_at`, drop column `last_denial_notice_at`;');
    this.addSql('drop table if exists `albion_rank_up_vote_entity`;');
    this.addSql('drop table if exists `member_daily_game_activity_entity`;');
    this.addSql('drop table if exists `member_daily_activity_entity`;');
  }

}
