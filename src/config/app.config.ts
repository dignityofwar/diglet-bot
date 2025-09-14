export default () => ({
  version: process.env.VERSION,
  environment: process.env.ENVIRONMENT || "development",
  healthcheckUUID: process.env.HEALTHCHECK_UUID,
});
