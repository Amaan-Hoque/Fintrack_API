const { connectDb } = require('./config/db');
const app = require('./app');
const logger = require('./config/logger');

connectDb()
  .then(() => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => logger.info('Server started', { port }));
  })
  .catch((err) => {
    logger.error('Startup failed', { error: err.message });
  });
