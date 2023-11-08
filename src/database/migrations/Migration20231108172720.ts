import { Migration } from '@mikro-orm/migrations';

export class Migration20231108172720 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `albion_members_entity` rename to `albion_registrations_entity`;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `albion_registrations_entity` rename to `albion_members_entity`;');
  }
}
