module.exports = (sequelize, DataTypes) => {
  const UnitKerja = sequelize.define('UnitKerja', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nama: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    deskripsi: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uses_shift_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Apakah unit ini menggunakan sistem shift'
    },
    shift_pagi_path: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Path SIMRS untuk shift pagi'
    },
    shift_malam_path: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Path SIMRS untuk shift malam'
    },
    shift_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Apakah sistem shift aktif untuk unit ini'
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
    tableName: 'unit_kerja',
    timestamps: false
  });

  // Define associations
  UnitKerja.associate = (models) => {
    UnitKerja.hasMany(models.User, {
      foreignKey: 'unit_kerja_id'
    });
    UnitKerja.hasMany(models.SimrsUsage, {
      foreignKey: 'unit_kerja_id'
    });
    UnitKerja.hasMany(models.ShiftLog, {
      foreignKey: 'unit_kerja_id'
    });
  };

  // Instance method untuk mendapatkan path SIMRS berdasarkan shift
  UnitKerja.prototype.getSimrsPathForShift = function(shiftName) {
    if (!this.uses_shift_system || !this.shift_enabled) {
      return null;
    }
    
    return shiftName === 'pagi' ? this.shift_pagi_path : this.shift_malam_path;
  };

  // Instance method untuk mendapatkan path SIMRS saat ini
  UnitKerja.prototype.getCurrentSimrsPath = async function() {
    if (!this.uses_shift_system || !this.shift_enabled) {
      return null;
    }

    const ShiftSchedule = sequelize.models.ShiftSchedule;
    const currentShift = await ShiftSchedule.getCurrentShift();
    
    return this.getSimrsPathForShift(currentShift.shift_name);
  };

  // Static method untuk mendapatkan semua unit yang menggunakan sistem shift
  UnitKerja.getShiftEnabledUnits = async function() {
    return await this.findAll({
      where: {
        uses_shift_system: true,
        shift_enabled: true
      }
    });
  };

  return UnitKerja;
};
