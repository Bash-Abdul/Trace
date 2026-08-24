import { app } from './app.js';
import { env } from './config/index.js';

app.listen(env.PORT, () => {
  console.log(`Trace API running on http://localhost:${env.PORT}`);
});
