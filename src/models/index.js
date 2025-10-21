const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Initialize Sequelize with database connection
const sequelize = new Sequelize('signon_db', 'monarch', 'LughTuathaDe@#3', {
  host: '192.168.0.3',
  port: 3939,
  dialect: 'mysql',
  logging: msg => log.debug(msg),
  dialectOptions: {
    connectTimeout: 60000, // 60 seconds
    acquireTimeout: 60000,
    timeout: 60000
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
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
  'shift_schedule.js'
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
