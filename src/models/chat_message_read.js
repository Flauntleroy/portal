module.exports = (sequelize, DataTypes) => {
  const ChatMessageRead = sequelize.define('ChatMessageRead', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    message_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'chat_messages',
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
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'chat_message_reads',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['message_id', 'user_id']
      }
    ]
  });

  ChatMessageRead.associate = (models) => {
    ChatMessageRead.belongsTo(models.ChatMessage, {
      foreignKey: 'message_id',
      as: 'Message'
    });
    ChatMessageRead.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User'
    });
  };

  return ChatMessageRead;
};