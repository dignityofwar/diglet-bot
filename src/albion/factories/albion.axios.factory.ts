import axios, { AxiosInstance } from 'axios';

export default class AlbionAxiosFactory {
  public createAlbionApiClient(): AxiosInstance {
    return axios.create({
      baseURL: 'https://gameinfo.albiononline.com/api/gameinfo',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
