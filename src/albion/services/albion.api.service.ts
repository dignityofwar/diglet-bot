import { Injectable } from '@nestjs/common';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import { PlayersResponseInterface, SearchResponseInterface } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionApiService {
  async getCharacter(characterName: string): Promise<PlayersResponseInterface> {
    const characterId = await this.getCharacterId(characterName);

    const request = new AlbionAxiosFactory().createAlbionApiClient();
    const response: PlayersResponseInterface = await request.get(`/players/${characterId}`);

    if (!response.data.Id) {
      throw new Error('Character does not exist. Please ensure you have supplied your exact name.');
    }

    if (response.data.Id !== characterId) {
      throw new Error('Character ID does not match.');
    }

    return response;
  }

  async getCharacterId(characterName: string): Promise<string> {
    const request = new AlbionAxiosFactory().createAlbionApiClient();
    const response: SearchResponseInterface = await request.get(`/search?q=${characterName}`);

    // Loop through the players response to find the character name
    const foundPlayer = response.data.players.filter((player) => {
      return player.Name === characterName;
    });

    // If there were no players found
    if (foundPlayer.length === 0) {
      throw new Error('Character does not exist. Please ensure you have supplied your exact name.');
    }

    // If there are multiple players found, they are duplicates and must be manually verified
    if (foundPlayer.length > 1) {
      throw new Error(`Multiple characters with exact name "${characterName}" found. Please contact the Guild Masters as manual intervention is required.`);
    }

    return foundPlayer[0].Id;
  }
}
