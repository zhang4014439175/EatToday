import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/eat_today.db';
const backupDir = path.join(path.dirname(dbPath), 'backup');

function getFormattedLocalTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${date}_${hours}${minutes}${seconds}`;
}

async function runBackup() {
  console.log('[Backup Script] 开始执行数据库自动备份任务...');
  
  try {
    // 1. 确保源数据库文件存在
    if (!fs.existsSync(dbPath)) {
      console.error(`[Backup Error] 找不到源数据库文件: ${dbPath}`);
      return;
    }

    // 2. 确保备份输出目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 3. 构建备份目标文件名 (如: eat_today_backup_20260630_085530.db)
    const ext = path.extname(dbPath);
    const baseName = path.basename(dbPath, ext);
    const timestamp = getFormattedLocalTime();
    const backupFileName = `${baseName}_backup_${timestamp}${ext}`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // 4. 执行物理拷贝备份
    fs.copyFileSync(dbPath, backupFilePath);
    console.log(`[Backup Success] 备份拷贝成功: ${backupFilePath}`);

    // 5. 自动清理机制：保留最近 7 次备份，清理更早的历史备份
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(`${baseName}_backup_`) && f.endsWith(ext))
      .map(f => {
        const filePath = path.join(backupDir, f);
        return {
          name: f,
          filePath: filePath,
          mtime: fs.statSync(filePath).mtime // 获取最后修改时间
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序排序 (最新的排最前)

    const MAX_BACKUPS = 7;
    if (files.length > MAX_BACKUPS) {
      console.log(`[Backup Cleanup] 发现当前备份文件共 ${files.length} 个，超出保留上限 ${MAX_BACKUPS} 个。开始清理老旧备份...`);
      for (let i = MAX_BACKUPS; i < files.length; i++) {
        fs.unlinkSync(files[i].filePath);
        console.log(`[Backup Cleanup] 已成功删除历史过期备份: ${files[i].name}`);
      }
    }
    
    console.log('[Backup Script] 数据库备份任务已全部执行完毕。');
  } catch (error) {
    console.error('[Backup Error] 执行备份过程遇到严重错误:', error);
  }
}

runBackup();
