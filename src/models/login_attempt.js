module.exports = (sequelize, DataTypes) => {
  const LoginAttempt = sequelize.define('LoginAttempt', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    success: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'login_attempts',
    timestamps: false
  });

  // Define associations
  LoginAttempt.associate = (models) => {
    LoginAttempt.belongsTo(models.User, {
      foreignKey: 'user_id'
    });
  };

  return LoginAttempt;
};
