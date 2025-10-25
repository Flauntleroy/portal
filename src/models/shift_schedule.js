const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ShiftSchedule = sequelize.define('ShiftSchedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shift_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Nama shift (pagi/malam)'
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: 'Waktu mulai shift'
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: 'Waktu selesai shift'
    },
    is_overnight: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Apakah shift melewati tengah malam'
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
    tableName: 'shift_schedules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Helper untuk membandingkan waktu HH:MM:SS sebagai Date pada epoch tetap
  const toDate = (timeStr) => new Date(`1970-01-01T${timeStr}`);

  // Static method untuk mendapatkan shift aktif berdasarkan waktu
  ShiftSchedule.getCurrentShift = async function() {
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 8); // Format HH:MM:SS
    const current = toDate(currentTimeStr);
    
    const shifts = await this.findAll({
      order: [['start_time', 'ASC']]
    });

    for (const shift of shifts) {
      const start = toDate(shift.start_time);
      const end = toDate(shift.end_time);
      // Deteksi overnight otomatis berbasis nilai start/end
      const isOvernight = start > end; // contoh: 20:00 ke 06:00

      if (isOvernight) {
        // Jika melewati tengah malam: waktu aktif bila current >= start OR current < end
        if (current >= start || current < end) {
          return shift;
        }
      } else {
        // Normal: current berada di [start, end)
        if (current >= start && current < end) {
          return shift;
        }
      }
    }

    // Default ke shift malam jika tidak ada yang cocok
    return shifts.find(s => s.shift_name === 'malam') || shifts[0];
  };

  // Static method untuk cek apakah sedang dalam periode pergantian shift
  ShiftSchedule.isShiftChangeTime = async function(toleranceMinutes = 5) {
    const now = new Date();
    const currentTimeStr = now.toTimeString().slice(0, 8);
    const current = toDate(currentTimeStr);
    
    const shifts = await this.findAll();
    
    for (const shift of shifts) {
      const start = toDate(shift.start_time);
      const diffMinutes = Math.abs((current - start) / (1000 * 60));
      
      if (diffMinutes <= toleranceMinutes) {
        return {
          isChangeTime: true,
          newShift: shift.shift_name,
          timeUntilChange: diffMinutes
        };
      }
    }
    
    return {
      isChangeTime: false,
      newShift: null,
      timeUntilChange: null
    };
  };

  return ShiftSchedule;
};