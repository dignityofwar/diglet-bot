import { Injectable, Logger } from '@nestjs/common';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import {
  AlbionPlayerInterface,
  AlbionPlayersResponseInterface,
  AlbionSearchResponseInterface, AlbionServer,
} from '../interfaces/albion.api.interfaces';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlbionApiService {
  private readonly logger = new Logger(AlbionApiService.name);
  constructor(
    private readonly config: ConfigService,
  ) {}

  async getCharacter(characterName: string): Promise<AlbionPlayerInterface> {
    const characterId = await this.getCharacterId(characterName);
    return await this.queryCharacter(characterId);
  }

  async getCharacterById(characterId: string): Promise<AlbionPlayerInterface> {
    return await this.queryCharacter(characterId);
  }

  async queryCharacter(characterId: string): Promise<AlbionPlayerInterface> {
    const request = new AlbionAxiosFactory().createApiClient(AlbionServer.EUROPE);

    const response: AlbionPlayersResponseInterface = await request.get(`/players/${characterId}`);

    if (response.data.Id !== characterId) {
      this.throwError(`Character ID \`${characterId}\` does not match API response consistently. Pinging <@${this.config.get('discord.devUserId')}>!`);
    }

    return response.data;
  }

  async getCharacterId(characterName: string): Promise<string> {
    const request = new AlbionAxiosFactory().createApiClient(AlbionServer.EUROPE);
    const query = `/search?q=${characterName}`;
    this.logger.debug(`Querying Albion API for character ID: ${request.defaults.baseURL}${query}`);
    const response: AlbionSearchResponseInterface = await request.get(query);

    // Loop through the players response to find the character name
    const foundPlayer = response.data.players.filter((player) => {
      return player.Name === characterName;
    });

    // If there were no players found
    if (foundPlayer.length === 0) {
      this.throwError(`Character **${characterName}** does not seem to exist on Albion. Please ensure: 
1. You've supplied your **exact** character name (case sensitive).
2. Your character is older than 48 hours.`);
    }

    if (foundPlayer.length > 1) {
      const guildId = this.config.get('albion.guildId');
      // If there are multiple players found, we need to loop them to check if any of them are in the guild, and return that character
      const foundPlayerInGuild = foundPlayer.filter((player) => {
        return player.GuildId === guildId;
      });

      if (foundPlayerInGuild.length === 0) {
        this.throwError(`multiple characters for **${characterName}** were found, none of them are a guild member.`);
      }

      if (foundPlayerInGuild.length === 1) {
        return foundPlayerInGuild[0].Id;
      }
      else {
        this.throwError(`multiple characters for **${characterName}** were found within the DIG guild. This is an unsupported use case for this registration system. Pinging <@${this.config.get('discord.devUserId')}>!`);
      }
    }

    return foundPlayer[0].Id;
  }

  async getAllGuildMembers(guildId: string): Promise<AlbionPlayerInterface[]> {
    const request = new AlbionAxiosFactory().createApiClient(AlbionServer.EUROPE);
    const response: AlbionPlayersResponseInterface = await request.get(`/guilds/${guildId}/members`);
    const data = response.data;

    const members: AlbionPlayerInterface[] = [];

    for (const member in data) {
      members.push(data[member]);
    }

    return members;
  }

  private throwError(error: string) {
    console.error(error);
    throw new Error(error);
  }
}
