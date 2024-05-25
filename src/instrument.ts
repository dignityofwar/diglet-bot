// Import with `const Sentry = require("@sentry/node");` if you are using CJS
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: 'https://e4f532343360a2d2444f319c0ef1b720@o4507319323262976.ingest.de.sentry.io/4507319324901456',
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions

  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});
