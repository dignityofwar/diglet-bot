import { Migration } from '@mikro-orm/migrations';
import { AlbionApiService } from '../../albion/services/albion.api.service';
import { AlbionPlayerInterface } from '../../albion/interfaces/albion.api.interfaces';
import { ConfigService } from '@nestjs/config';

export class Migration20230925183448 extends Migration {

  async up(): Promise<void> {
    const service = new AlbionApiService(new ConfigService());

    this.addSql('create table `albion_members_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `discord_id` varchar(255) not null, `character_id` varchar(255) not null, `character_name` varchar(255) not null, `manual` varchar(255) not null default false, `manual_created_by_discord_id` varchar(255) null default null, `manual_created_by_discord_name` varchar(255) null default null) default character set utf8mb4 engine = InnoDB;');
    this.addSql('alter table `albion_members_entity` add index `albion_members_entity_discord_id_index`(`discord_id`);');
    this.addSql('alter table `albion_members_entity` add unique `albion_members_entity_discord_id_unique`(`discord_id`);');
    this.addSql('alter table `albion_members_entity` add index `albion_members_entity_character_id_index`(`character_id`);');
    this.addSql('alter table `albion_members_entity` add unique `albion_members_entity_character_id_unique`(`character_id`);');

    // Add in missing members
    const members = [
      { discordId: '90078072660852736', characterName: 'Maelstrome26', characterId: '', valid: false },
      { discordId: '189331211125129216', characterName: 'IBeatHim1', characterId: '', valid: false },
      { discordId: '187676512843988992', characterName: 'KuroNecron', characterId: '', valid: false },
      { discordId: '776126566371557406', characterName: 'bamzot', characterId: '', valid: false },
      { discordId: '588827945171288101', characterName: 'Vararon', characterId: '', valid: false },
      { discordId: '918213678946467890', characterName: 'sirandreMMM', characterId: '', valid: false },
      { discordId: '1009958238407635054', characterName: 'Ferenthil', characterId: '', valid: false },
      // { discordId: '1044257580404441141', characterName: 'RagingDuck312', characterId: '', valid: false },
      { discordId: '750958249632727050', characterName: 'RubberDuckie', characterId: '', valid: false },
      { discordId: '922163739883601950', characterName: 'WankingKing', characterId: '', valid: false },
      { discordId: '473242400748339202', characterName: 'kirbosity', characterId: '', valid: false },
      { discordId: '628903707844542464', characterName: 'OttisDerJagd', characterId: '', valid: false },
      { discordId: '1133092820392091698', characterName: 'SunlessMoon', characterId: '', valid: false },
      { discordId: '798029071656550400', characterName: 'TheCloneTrooper', characterId: '', valid: false },
      { discordId: '321732465528143875', characterName: 'Diegod2', characterId: '', valid: false },
      { discordId: '216222617089081344', characterName: 'Dagsly', characterId: '', valid: false },
      { discordId: '496613265003249664', characterName: 'Demonslayer324', characterId: '', valid: false },
      { discordId: '695308881823268944', characterName: 'aznomi', characterId: '', valid: false },
      { discordId: '216228173212418049', characterName: 'RevMacduff', characterId: '', valid: false },
      { discordId: '784527591033405481', characterName: 'Samotin', characterId: '', valid: false },
      { discordId: '273297610633379851', characterName: 'invisqt', characterId: '', valid: false },
      { discordId: '802020150722822185', characterName: 'madkite', characterId: '', valid: false },
      { discordId: '593016461048414235', characterName: 'Panther3o8', characterId: '', valid: false },
      { discordId: '111613990630612992', characterName: 'Greggernaut', characterId: '', valid: false },
      // { discordId: '103661525436211200', characterName: 'Savvn', characterId: '', valid: false },
      { discordId: '398181003803361302', characterName: 'Davbil1', characterId: '', valid: false },
      { discordId: '744335284119797911', characterName: 'StrawBerryyMilk', characterId: '', valid: false },
      { discordId: '516994438397034501', characterName: 'TheVoidSage', characterId: '', valid: false },
      { discordId: '790870846397743125', characterName: 'thegreatfarouth', characterId: '', valid: false },
      // { discordId: '382948282609041418', characterName: 'Borotalko', characterId: '', valid: false },
      // { discordId: '969767480404897843', characterName: 'Blackerman', characterId: '', valid: false },
      { discordId: '735301612117033050', characterName: 'ALLAHinUs', characterId: '', valid: false },
      { discordId: '283004251133706241', characterName: 'BirdCow', characterId: '', valid: false },
      { discordId: '916409574658039870', characterName: 'Matinaaaaa', characterId: '', valid: false },
      { discordId: '770866385482940457', characterName: 'atomicduckling09', characterId: '', valid: false },
      { discordId: '666838898865078303', characterName: 'Woxlff', characterId: '', valid: false },
      { discordId: '166264279782129665', characterName: 'KingGrilly', characterId: '', valid: false },
      { discordId: '345689246910251009', characterName: 'Glayl', characterId: '', valid: false },
      { discordId: '457608305901043734', characterName: 'ShadowMan3', characterId: '', valid: false },
      { discordId: '824770098350522368', characterName: 'AyyyyyyyP', characterId: '', valid: false },
      { discordId: '1132553721755218010', characterName: 'Nazpara', characterId: '', valid: false },
      { discordId: '205820200916877313', characterName: 'DutchVH', characterId: '', valid: false },
      { discordId: '720962100675084378', characterName: 'JohnChef', characterId: '', valid: false },
      { discordId: '390188122887159808', characterName: 'Bolvack', characterId: '', valid: false },
      { discordId: '412031369317974036', characterName: 'NaxxRamus', characterId: '', valid: false },
      // { discordId: '708456544928268408', characterName: 'Drcake333', characterId: '', valid: false },
      { discordId: '455140008626487316', characterName: 'SoloDL', characterId: '', valid: false },
      { discordId: '689869981495853086', characterName: 'Runtz0420', characterId: '', valid: false },
      { discordId: '725007278876524684', characterName: 'Lairre', characterId: '', valid: false },
      { discordId: '737421980122218527', characterName: 'KoriNoMajitsushi', characterId: '', valid: false },
      { discordId: '339011147070046208', characterName: 'tinypinch', characterId: '', valid: false },
      { discordId: '704508833040695427', characterName: 'NatalaliaDreams', characterId: '', valid: false },
      { discordId: '1154445549794246657', characterName: 'BlackJackal69', characterId: '', valid: false },
      { discordId: '979133043052781608', characterName: 'Antanas39', characterId: '', valid: false },
      { discordId: '286599456160219139', characterName: 'buracu', characterId: '', valid: false },
      { discordId: '301005621812264961', characterName: 'Ztirith', characterId: '', valid: false },
    ];

    console.log(`Checking ${members.length} members to see if they're valid...`);

    const promises = [];

    // For each member, scan the API for their character ID
    for (const member of members) {
      // eslint-disable-next-line no-async-promise-executor
      const promise = new Promise(async (resolve) => {
        await service.getCharacter(member.characterName).then((response) => {
          if (response.GuildId !== 'btPZRoLvTUqLC7URnDRgSQ') {
            console.error(`Character ${member.characterName} does not belong to the guild any longer`);
            return resolve(null);
          }
          return resolve(response);
        }).catch(() => {
          console.log(`Character ${member.characterName} does not exist`);
          return resolve(null);
        });
      });

      promises.push(promise);
    }

    const characters = await Promise.all(promises);
    const validCharacters: AlbionPlayerInterface[] = characters.filter((character) => {
      return character !== null && character.GuildId === 'btPZRoLvTUqLC7URnDRgSQ';
    });

    console.log(`Found ${validCharacters.length} valid members`);

    // Insert the members into the database
    members.forEach((member) => {
      const char = validCharacters.filter((character) => {
        return character.Name === member.characterName;
      })[0];

      if (!char) {
        console.error(`Character ${member.characterName} is not valid.`);
        return;
      }

      const sql = `insert into \`albion_members_entity\` (\`discord_id\`, \`character_id\`, \`character_name\`, \`manual\`, \`manual_created_by_discord_id\`, \`manual_created_by_discord_name\`, \`created_at\`, \`updated_at\`) values ('${member.discordId}', '${char.Id}', '${member.characterName}', '1', '90078072660852736', 'Maelstrome', now(), now());`;
      // console.log(sql);
      this.addSql(sql);
    });
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists `albion_members_entity`;');
  }
}
