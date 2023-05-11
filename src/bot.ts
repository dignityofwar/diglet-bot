import { Client } from "discord.js";
import ready from "./listeners/ready";
import interactionCreate from "./events/InteractionCreate";

console.log("Bot is starting...");

const token = "MTEwNjMxODg4OTMxNjUyODE3OA.GCZ18R.WJLOW-YfBwDdJnpKlRW1L0PlwAwwTtgDELoF0s"

const client = new Client({
    intents: []
});

// Declare listeners
ready(client);

// Declare event handlers
interactionCreate(client);


client.login(token);

console.log(client);
