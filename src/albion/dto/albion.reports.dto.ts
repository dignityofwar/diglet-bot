import { Param, ParamType } from "@discord-nestjs/core";

export class AlbionReportsDto {
  @Param({
    name: "full-report",
    description: "Create a full report of all members.",
    required: false,
    type: ParamType.BOOLEAN,
  })
  fullReport = false;
  @Param({
    name: "squire-candidates",
    description: "Create a list of initiates who are eligible for squire.",
    required: false,
    type: ParamType.BOOLEAN,
  })
  squireCandidates = false;
}
