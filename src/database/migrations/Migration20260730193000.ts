import { Migration } from '@mikro-orm/migrations';

// Hand-written for the same reason as Migration20260728012034 — the snapshot is behind the
// entities, so `migration:create` emits a full `create table` for this one.
export class Migration20260730193000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql('alter table `albion_registration_queue_entity` add `force_queued` tinyint(1) not null default false;');
  }

  override down(): void | Promise<void> {
    this.addSql('alter table `albion_registration_queue_entity` drop column `force_queued`;');
  }

}
