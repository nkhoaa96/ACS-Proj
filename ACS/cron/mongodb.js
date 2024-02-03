const MongoClient = require('mongodb').MongoClient;

const url = 'mongodb://mongoservice:27017/admin';

let db = null;

async function connect() {
  if (db) {
    return db;
  }

  try {
    const client = await MongoClient.connect(url);
    db = client.db();
    console.log('Connection Success!');
    return db;
  } catch (err) {
    console.error('Connection Fail:', err);
    throw err;
  }
}

module.exports = { connect };
