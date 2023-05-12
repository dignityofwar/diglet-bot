import axios, { AxiosInstance } from 'axios';

export default class AxiosFactory {
    public createT4AClient(): AxiosInstance {
        return axios.create({
            baseURL: 'https://gameinfo.albiononline.com/api/gameinfo',
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
}
