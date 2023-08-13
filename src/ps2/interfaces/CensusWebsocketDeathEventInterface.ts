export interface CensusWebsocketDeathEventInterface {
  // There's loads more missing out of these but these are the only ones we care about
  attacker_character_id: string;
  attacker_team_id: string;
  attacker_weapon_id: string;
  character_id: string;
  team_id: string;
  timestamp: string;
  world_id: string;
}
