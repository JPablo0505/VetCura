// Local .env first (gitignored); real environments inject variables directly.
require('dotenv').config();
const { openDatabase } = require('../db');
const { createApp } = require('../src/app');

const port = Number(process.env.PORT || 3001);
const dbPath = process.env.DATABASE_PATH || './data/vetcura.db';
const db = openDatabase(dbPath);
const app = createApp(db);

app.listen(port, () => {
  console.log(`VetCura backend listening on :${port} (db: ${dbPath})`);
});
