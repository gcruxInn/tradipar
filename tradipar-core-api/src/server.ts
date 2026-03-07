import app from './app';
import { ENV } from './config/env';

app.listen(ENV.PORT, () => {
  console.log(`[CORE API] Framework started at http://localhost:${ENV.PORT}`);
  console.log(`[CORE API] Connecting to Sankhya Sandbox Authentication Gateway...`);
});
