import axios, { AxiosInstance } from 'axios';
import { AlbionApiEndpoint, AlbionServer } from '../interfaces/albion.api.interfaces';

export default class AlbionAxiosFactory {
  public createApiClient(server: AlbionServer): AxiosInstance {
    switch (server) {
      case AlbionServer.AMERICAS:
        return this.createAlbionApiAmericasClient();
      case AlbionServer.EUROPE:
        return this.createAlbionApiEuropeClient();
      default:
        throw new Error('Invalid Albion API region');
    }
  }

  public createAlbionApiAmericasClient(): AxiosInstance {
    return axios.create({
      baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  public createAlbionApiEuropeClient(): AxiosInstance {
    return axios.create({
      baseURL: AlbionApiEndpoint.ALBION_EUROPE,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
