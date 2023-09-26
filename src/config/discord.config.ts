export default () => ({
  devUserId: process.env.DISCORD_DEVUSER_ID,
  channels: {
    albionRegistration: process.env.CHANNEL_ALBION_REGISTER,
    albionWelcomeToAlbion: process.env.CHANNEL_ALBION_WELCOME,
    ps2Verify: process.env.CHANNEL_PS2_VERIFY,
    ps2Private: process.env.CHANNEL_PS2_PRIVATE,
    ps2HowToRankUp: process.env.CHANNEL_PS2_HOW_TO_RANK_UP,
    ps2Scans: process.env.CHANNEL_PS2_SCANS,
  },
  roles: {
    albionInitiateRoleId: process.env.ROLE_ALBION_INITIATE,
    albionVerifiedRoleId: process.env.ROLE_ALBION_VERIFIED,
    ps2Verified: process.env.ROLE_PS2_VERIFIED,
    ps2Zealot: process.env.ROLE_PS2_ZEALOT,
  },
});
