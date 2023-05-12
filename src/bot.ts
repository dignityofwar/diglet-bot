import { Client } from 'discord.js';
import ReadyListener from './listeners/ReadyListener';
import * as dotenv from 'dotenv';
import InteractionCreate from './events/InteractionCreate';

export default class Bot {
    private client: Client;

    constructor() {
        this.client = new Client({
            intents: [],
        });

        // Set up event listeners
        this.client.on('ready', () => new ReadyListener(this.client).handle());
        this.client.on('interactionCreate', (interaction) => new InteractionCreate(this.client).handle(interaction));
    }

    public async start(): Promise<void> {
        await this.client.login(process.env.TOKEN);
    }
}

dotenv.config();

new Bot().start().then(() => console.log('Bot started!'));
