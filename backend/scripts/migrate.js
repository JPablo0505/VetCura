const { openDatabase } = require('../db');

const dbPath = process.env.DATABASE_PATH || './data/vetcura.db';
openDatabase(dbPath);
console.log(`Migrations applied on ${dbPath}`);
