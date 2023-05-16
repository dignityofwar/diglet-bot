// Seemingly this interface appears to always return null
interface EquipmentInterface {
  MainHand: string | null;
  OffHand: string | null;
  Head: string | null;
  Armor: string | null;
  Shoes: string | null;
  Bag: string | null;
  Cape: string | null;
  Mount: string | null;
  Potion: string | null;
  Food: string | null;
}

interface AreaStatisticsInterface {
  Total: number;
  Royal: number;
  Outlands: number;
  Avalon: number;
}

interface StatisticsInterface extends AreaStatisticsInterface {
  Hellgate: number;
  CorruptedDungeon: number;
  Mists: number;
}

interface PlayerDetailsInterface {
  Id: string;
  Name: string;
  GuildId: string;
  GuildName: string | null;
  AllianceName: string; // Weirdly not null if it's empty, yay consistency
  AllianceId: string;
  Avatar: string;
  AvatarRing: string;
  DeathFame: number;
  KillFame: number;
  FameRatio: number;
}

interface SearchPlayerInterface extends PlayerDetailsInterface {
  totalKills: null;
  gvgKills: null;
  gvgWon: null;
}

interface PlayerDataInterface extends PlayerDetailsInterface {
  AverageItemPower: number; // Always seems to return 0
  Equipment: EquipmentInterface;
  Inventory: [];
  LifetimeStatistics: {
    PvE: StatisticsInterface;
    Gathering: {
      Fiber: AreaStatisticsInterface;
      Hide: AreaStatisticsInterface;
      Ore: AreaStatisticsInterface;
      Rock: AreaStatisticsInterface;
      Wood: AreaStatisticsInterface;
      All: AreaStatisticsInterface;
    };
    Crafting: AreaStatisticsInterface;
    CrystalLeague: number;
    FishingFame: number
    FarmingFame: number
    Timestamp: string
  }
}

export interface PlayersResponseInterface {
  data: PlayerDataInterface
}

export interface SearchResponseInterface {
  data: {
    guilds: [{
      Id: string;
      Name: string;
      AllianceId: string;
      AllianceName: string;
      KillFame: null; // Seems to always be null
      DeathFame: number
    }]
    players: [SearchPlayerInterface]
  }
}
