import { Injectable } from '@nestjs/common';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import { PlayersResponseInterface, SearchResponseInterface } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionApiService {
  async getCharacter(characterName: string): Promise<PlayersResponseInterface> {
    const characterId = await this.getCharacterId(characterName);

    const request = new AlbionAxiosFactory().createAlbionApiClient();
    const response: PlayersResponseInterface = await request.get(`/players/${characterId}`);

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

    // There should only be one
    if (foundPlayer.length !== 1) {
      throw new Error('Found more than one player with the same name. Please supply your exact name');
    }

    // Check if the name matches
    if (foundPlayer[0].Name !== characterName) {
      throw new Error('Player not found. Please ensure you have supplied your exact name.');
    }

    return foundPlayer[0].Id;
  }
}
