import { Injectable } from '@nestjs/common';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import { AlbionPlayersResponseInterface, AlbionSearchResponseInterface } from '../interfaces/albion.api.interfaces';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlbionApiService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  async getCharacter(characterName: string): Promise<AlbionPlayersResponseInterface> {
    const characterId = await this.getCharacterId(characterName);

    const request = new AlbionAxiosFactory().createAlbionApiClient();
    const response: AlbionPlayersResponseInterface = await request.get(`/players/${characterId}`);

    if (response.data.Id !== characterId) {
      throw new Error(`Character ID \`${characterId}\` does not match API response consistently.`);
    }

    return response;
  }

  private async getCharacterId(characterName: string): Promise<string> {
    const request = new AlbionAxiosFactory().createAlbionApiClient();
    const response: AlbionSearchResponseInterface = await request.get(`/search?q=${characterName}`);

    // Loop through the players response to find the character name
    const foundPlayer = response.data.players.filter((player) => {
      return player.Name === characterName;
    });

    // If there were no players found
    if (foundPlayer.length === 0) {
      throw new Error(`Character **${characterName}** does not exist. Please ensure you have supplied your exact name.`);
    }

    if (foundPlayer.length > 1) {
      // If there are multiple players found, we need to loop them to check if any of them are in the guild, and return that character
      const foundPlayerInGuild = foundPlayer.filter((player) => {
        return player.GuildId === this.config.get('albion.guildGameId');
      });

      if (foundPlayerInGuild.length === 0) {
        throw new Error(`Multiple characters for **${characterName}** were found, none of them are a guild member.`);
      }

      if (foundPlayerInGuild.length === 1) {
        return foundPlayerInGuild[0].Id;
      }
      else {
        throw new Error(`Multiple characters for **${characterName}** were found within the guild. This is an unsupported use case for this registration system. Congrats you broke it. Please contact the Albion Guild Masters.`);
      }
    }

    return foundPlayer[0].Id;
  }
}
