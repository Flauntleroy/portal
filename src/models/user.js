const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    full_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    unit_kerja_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    contact: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    simrs_path: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'users',
    timestamps: false,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  });

  // Instance method to validate password
  User.prototype.validatePassword = async function(password) {
    return bcrypt.compare(password, this.password);
  };

  // Define associations
  User.associate = (models) => {
    User.belongsTo(models.UnitKerja, {
      foreignKey: 'unit_kerja_id'
    });
    User.hasMany(models.LoginAttempt, {
      foreignKey: 'user_id'
    });
    User.hasMany(models.SimrsUsage, {
      foreignKey: 'user_id'
    });
  };

  return User;
};
