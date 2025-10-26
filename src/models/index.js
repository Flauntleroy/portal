const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
let log;
try { log = require('electron-log'); } catch (e) { log = console; }

// Initialize Sequelize with database connection (env-aware)
const DB_NAME = process.env.DB_NAME || 'signon_db';
const DB_USER = process.env.DB_USER || 'monarch';
const DB_PASS = process.env.DB_PASS || 'LughTuathaDe@#3';
const DB_HOST = process.env.DB_HOST || '192.168.0.3';
const DB_PORT = parseInt(process.env.DB_PORT || '3939', 10);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: msg => (log && log.debug ? log.debug(msg) : console.debug(msg)),
  dialectOptions: {
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '60000', 10) // 60 seconds
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    min: parseInt(process.env.DB_POOL_MIN || '0', 10),
    acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
    idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10)
  }
});

// Initialize db object
const db = {};

// Import all model files
const modelFiles = [
  'user.js',
  'unit_kerja.js',
  'login_attempt.js',
  'simrs_usage.js',
  'shift_log.js',
  'shift_schedule.js',
  'chat_room.js',
  'chat_participant.js',
  'chat_message.js',
  'chat_message_read.js',
  'online_user.js'
];

// Load models
modelFiles.forEach(file => {
  const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
});

// Set up associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
