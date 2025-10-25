module.exports = (sequelize, DataTypes) => {
  const ChatRoom = sequelize.define('ChatRoom', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('direct', 'group', 'unit_kerja', 'broadcast'),
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    unit_kerja_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'unit_kerja',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    description: {
      type: DataTypes.TEXT,
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
    tableName: 'chat_rooms',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  ChatRoom.associate = (models) => {
    ChatRoom.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'CreatedBy'
    });
    ChatRoom.belongsTo(models.UnitKerja, {
      foreignKey: 'unit_kerja_id',
      as: 'UnitKerja'
    });
    ChatRoom.hasMany(models.ChatMessage, {
      foreignKey: 'room_id',
      as: 'Messages'
    });
    ChatRoom.hasMany(models.ChatParticipant, {
      foreignKey: 'room_id',
      as: 'Participants'
    });
  };

  return ChatRoom;
};