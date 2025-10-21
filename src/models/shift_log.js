const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ShiftLog = sequelize.define('ShiftLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    unit_kerja_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'unit_kerja',
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
    old_shift: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Shift sebelumnya'
    },
    new_shift: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Shift baru'
    },
    old_simrs_session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'simrs_usage',
        key: 'id'
      },
      comment: 'ID sesi SIMRS yang ditutup'
    },
    new_simrs_session_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'simrs_usage',
        key: 'id'
      },
      comment: 'ID sesi SIMRS yang dibuka'
    },
    shift_change_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    auto_switched: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Apakah pergantian otomatis atau manual'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'shift_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  // Associations akan didefinisikan di index.js
  ShiftLog.associate = function(models) {
    ShiftLog.belongsTo(models.UnitKerja, {
      foreignKey: 'unit_kerja_id',
      as: 'UnitKerja'
    });
    
    ShiftLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User'
    });
    
    ShiftLog.belongsTo(models.SimrsUsage, {
      foreignKey: 'old_simrs_session_id',
      as: 'OldSimrsSession'
    });
    
    ShiftLog.belongsTo(models.SimrsUsage, {
      foreignKey: 'new_simrs_session_id',
      as: 'NewSimrsSession'
    });
  };

  // Static method untuk mendapatkan log shift terbaru untuk unit tertentu
  ShiftLog.getLatestShiftForUnit = async function(unitKerjaId) {
    return await this.findOne({
      where: { unit_kerja_id: unitKerjaId },
      order: [['shift_change_time', 'DESC']],
      include: [
        { model: sequelize.models.UnitKerja, as: 'UnitKerja' },
        { model: sequelize.models.User, as: 'User' }
      ]
    });
  };

  // Static method untuk mendapatkan riwayat shift dalam periode tertentu
  ShiftLog.getShiftHistory = async function(unitKerjaId, startDate, endDate) {
    const whereClause = { unit_kerja_id: unitKerjaId };
    
    if (startDate && endDate) {
      whereClause.shift_change_time = {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      };
    }

    return await this.findAll({
      where: whereClause,
      order: [['shift_change_time', 'DESC']],
      include: [
        { model: sequelize.models.UnitKerja, as: 'UnitKerja' },
        { model: sequelize.models.User, as: 'User' },
        { model: sequelize.models.SimrsUsage, as: 'OldSimrsSession' },
        { model: sequelize.models.SimrsUsage, as: 'NewSimrsSession' }
      ]
    });
  };

  return ShiftLog;
};