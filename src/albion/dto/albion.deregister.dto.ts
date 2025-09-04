import { Param, ParamType } from "@discord-nestjs/core";

export class AlbionDeregisterDto {
  @Param({
    name: "character-name",
    description: "Name of the character in game",
    required: false,
    minLength: 3,
    maxLength: 16,
    type: ParamType.STRING,
  })
  character?: string;

  @Param({
    name: "discord-member",
    description: "Discord User to deregister.",
    required: false,
    type: ParamType.USER,
  })
  discordMember?: string;
}
