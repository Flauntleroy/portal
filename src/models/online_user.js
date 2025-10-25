module.exports = (sequelize, DataTypes) => {
  const OnlineUser = sequelize.define('OnlineUser', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    socket_id: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('online', 'offline'),
      defaultValue: 'online'
    },
    last_active: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    connected_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    disconnected_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'online_users',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['socket_id'] }
    ]
  });

  OnlineUser.associate = (models) => {
    OnlineUser.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User'
    });
  };

  // Helper untuk update aktivitas
  OnlineUser.touch = async function(socketId) {
    const rec = await this.findOne({ where: { socket_id: socketId } });
    if (rec) {
      rec.last_active = new Date();
      await rec.save();
    }
  };

  return OnlineUser;
};