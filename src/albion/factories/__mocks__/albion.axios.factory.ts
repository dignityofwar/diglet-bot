import { AxiosInstance } from 'axios';

class MockAxiosInstance {
  get() {
    return Promise.resolve({ data: {} });
  }
}

const axiosInstance: AxiosInstance = new MockAxiosInstance() as any;

export default class AlbionAxiosFactory {
  createAlbionApiClient() {
    return axiosInstance;
  }
}
