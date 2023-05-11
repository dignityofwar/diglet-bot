import { Client } from 'discord.js';
import ready from './listeners/ready';
import interactionCreate from './events/InteractionCreate';
import * as dotenv from 'dotenv';

// Grab configs
dotenv.config();

console.log('Bot is starting...');

const token = process.env.TOKEN;

const client = new Client({
	intents: [],
});

// Declare listeners
ready(client);

// Declare event handlers
interactionCreate(client);

client.login(token);

