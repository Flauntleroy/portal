# Build Troubleshooting Guide

## Masalah Symbolic Link Permission pada Windows

### Deskripsi Masalah
Saat menjalankan `npm run build`, electron-builder gagal dengan error:
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

### Penyebab
- Windows memerlukan privilege khusus untuk membuat symbolic link
- electron-builder mencoba mengekstrak file winCodeSign yang berisi symbolic link untuk macOS
- User tidak memiliki privilege "Create symbolic links" yang diperlukan

### Solusi yang Berhasil

#### 1. Jalankan sebagai Administrator
```powershell
Start-Process powershell -Verb runAs -ArgumentList "-Command", "cd 'F:\Work\laragon\www\portal'; npm run build" -Wait
```

#### 2. Konfigurasi package.json
Tambahkan konfigurasi berikut untuk menghindari masalah code signing:

```json
{
  "build": {
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "requestedExecutionLevel": "asInvoker"
    },
    "forceCodeSigning": false,
    "electronDownload": {
      "cache": "./electron-cache"
    }
  }
}
```

#### 3. Bersihkan Cache
```powershell
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Force -ErrorAction SilentlyContinue
```

### Hasil Build
Setelah menerapkan solusi di atas, build berhasil menghasilkan:
- `dist/SIWASTA Desktop-1.0.0-portable.exe` (portable executable)
- `dist/win-unpacked/SIWASTA Desktop.exe` (unpacked executable)

### Alternatif Lain (Belum Ditest)
1. **Enable Developer Mode di Windows 10/11**
   - Settings > Update & Security > For developers > Developer mode

2. **Group Policy Setting**
   - gpedit.msc > Computer Configuration > Windows Settings > Security Settings > Local Policies > User Rights Assignment
   - "Create symbolic links" - tambahkan user atau group

3. **Registry Edit** (Hati-hati!)
   ```
   HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa
   REG_DWORD: EnableLinkedConnections = 1
   ```

### Catatan
- Solusi terbaik adalah menjalankan build sebagai Administrator
- Konfigurasi portable target menghindari kebutuhan code signing
- Cache lokal membantu menghindari download berulang