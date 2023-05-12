import { Client } from 'discord.js';
import { Commands } from '../commands';

export default class ReadyListener {
    private readonly client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    public async handle(): Promise<void> {
        await this.client.application?.commands.set(Commands);
    }
}
