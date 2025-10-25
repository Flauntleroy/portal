const path = require('path');
const log = require('electron-log');

(async () => {
  try {
    const db = require(path.join(__dirname, '..', 'src', 'models'));

    // Pastikan koneksi DB siap
    await db.sequelize.authenticate();
    log.info('[set_pagi_end_test] Database connected');

    // Ambil shift pagi
    const pagi = await db.ShiftSchedule.findOne({ where: { shift_name: 'pagi' } });
    if (!pagi) {
      console.error('[set_pagi_end_test] Shift pagi tidak ditemukan');
      process.exit(1);
    }

    // Hitung end_time baru: sekarang + 2 menit (format HH:MM:SS)
    const now = new Date();
    const target = new Date(now.getTime() + 2 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const newEnd = `${pad(target.getHours())}:${pad(target.getMinutes())}:00`;

    console.log(`[set_pagi_end_test] Mengubah end_time shift pagi dari ${pagi.end_time} ke ${newEnd}`);

    await pagi.update({
      end_time: newEnd,
      is_overnight: false
    });

    console.log('[set_pagi_end_test] Berhasil memperbarui jadwal shift pagi');
    process.exit(0);
  } catch (err) {
    console.error('[set_pagi_end_test] Error:', err);
    process.exit(1);
  }
})();