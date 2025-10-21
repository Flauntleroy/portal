module.exports = (sequelize, DataTypes) => {
  const SimrsUsage = sequelize.define('SimrsUsage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    unit_kerja_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: false
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'closed'),
      defaultValue: 'active'
    },
    current_shift: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Shift saat sesi SIMRS dimulai'
    },
    shift_auto_started: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Apakah sesi dimulai otomatis karena pergantian shift'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'simrs_usage',
    timestamps: false
  });

  // Define associations
  SimrsUsage.associate = (models) => {
    SimrsUsage.belongsTo(models.User, {
      foreignKey: 'user_id'
    });
    SimrsUsage.belongsTo(models.UnitKerja, {
      foreignKey: 'unit_kerja_id'
    });
    SimrsUsage.hasMany(models.ShiftLog, {
      foreignKey: 'old_simrs_session_id',
      as: 'OldShiftLogs'
    });
    SimrsUsage.hasMany(models.ShiftLog, {
      foreignKey: 'new_simrs_session_id',
      as: 'NewShiftLogs'
    });
  };

  // Static method untuk mendapatkan sesi aktif berdasarkan unit kerja
  SimrsUsage.getActiveSessionByUnit = async function(unitKerjaId) {
    return await this.findOne({
      where: {
        unit_kerja_id: unitKerjaId,
        status: 'active'
      },
      include: [
        { model: sequelize.models.User },
        { model: sequelize.models.UnitKerja }
      ],
      order: [['start_time', 'DESC']]
    });
  };

  // Static method untuk mendapatkan semua sesi aktif
  SimrsUsage.getAllActiveSessions = async function() {
    return await this.findAll({
      where: { status: 'active' },
      include: [
        { model: sequelize.models.User },
        { model: sequelize.models.UnitKerja }
      ],
      order: [['start_time', 'DESC']]
    });
  };

  // Instance method untuk menutup sesi
  SimrsUsage.prototype.closeSession = async function(notes = null) {
    this.end_time = new Date();
    this.status = 'closed';
    if (notes) {
      this.notes = notes;
    }
    return await this.save();
  };

  return SimrsUsage;
};
