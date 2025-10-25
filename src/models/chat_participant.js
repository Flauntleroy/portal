module.exports = (sequelize, DataTypes) => {
  const ChatParticipant = sequelize.define('ChatParticipant', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    room_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'chat_rooms',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    left_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    role: {
      type: DataTypes.ENUM('member', 'admin'),
      defaultValue: 'member'
    }
  }, {
    tableName: 'chat_participants',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['room_id', 'user_id']
      }
    ]
  });

  ChatParticipant.associate = (models) => {
    ChatParticipant.belongsTo(models.ChatRoom, {
      foreignKey: 'room_id',
      as: 'Room'
    });
    ChatParticipant.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User'
    });
  };

  return ChatParticipant;
};