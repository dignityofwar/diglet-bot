import { PlayersResponseInterface } from '../../interfaces/albion.api.interfaces';

export class AlbionApiService {
  async getCharacter(characterName: string): Promise<PlayersResponseInterface> {
    this.getCharacterId(characterName);

    // If it didn't die, return a mock response
    return {
      data: {
        'AverageItemPower':0.0, 'Equipment':{ 'MainHand':null, 'OffHand':null, 'Head':null, 'Armor':null, 'Shoes':null, 'Bag':null, 'Cape':null, 'Mount':null, 'Potion':null, 'Food':null }, 'Inventory':[], 'Name': characterName, 'Id':'tOuPzciNRAKEZLEbnkXjJw', 'GuildName':'DIG - Dignity of War', 'GuildId':'btPZRoLvTUqLC7URnDRgSQ', 'AllianceName':'DR0P', 'AllianceId':'NPlEu0zxQ2uStOPKoKk3Cg', 'AllianceTag':'', 'Avatar':'', 'AvatarRing':'', 'DeathFame':1235524, 'KillFame':809607, 'FameRatio':0.66, 'LifetimeStatistics':{ 'PvE':{ 'Total':18872169, 'Royal':3152109, 'Outlands':1964254, 'Avalon':328677, 'Hellgate':594819, 'CorruptedDungeon':0, 'Mists':1577218 }, 'Gathering':{ 'Fiber':{ 'Total':33755, 'Royal':11788, 'Outlands':8609, 'Avalon':630 }, 'Hide':{ 'Total':13421, 'Royal':7461, 'Outlands':1485, 'Avalon':90 }, 'Ore':{ 'Total':37150, 'Royal':12415, 'Outlands':994, 'Avalon':915 }, 'Rock':{ 'Total':30700, 'Royal':13817, 'Outlands':135, 'Avalon':1770 }, 'Wood':{ 'Total':25778, 'Royal':10348, 'Outlands':3597, 'Avalon':300 }, 'All':{ 'Total':140804, 'Royal':55829, 'Outlands':14820, 'Avalon':3705 } }, 'Crafting':{ 'Total':77056, 'Royal':0, 'Outlands':0, 'Avalon':0 }, 'CrystalLeague':0, 'FishingFame':2116, 'FarmingFame':371900, 'Timestamp':'2023-07-03T01:56:22.605835Z' },
      },
    };
  }

  async getCharacterId(characterName: string): Promise<string> {
    if (characterName === 'Maelstrome26') {
      return 'hd8zVXIjRc6lnb_1FYIgpw';
    }

    throw new Error('Character does not exist. Please ensure you have supplied your exact name.');
  }
}
