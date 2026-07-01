import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// 加载环境变量
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, 'data', 'eat_today.db');
const requestedJournalMode = (process.env.SQLITE_JOURNAL_MODE || (process.platform === 'win32' ? 'DELETE' : 'WAL')).toUpperCase();

// 确保数据库文件目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

/**
 * 获取数据库实例
 */
export function getDB() {
  if (!db) {
    throw new Error('Database is not initialized. Please call initDB() first.');
  }
  return db;
}

/**
 * 初始化数据库连接并创建表及索引
 */
export async function initDB() {
  return initDBOnce(true);
}

async function initDBOnce(canRecoverEmptyDb) {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log(`Successfully connected to SQLite database at: ${dbPath}`);

    // 配置 SQLite 参数以提高一致性；WAL 在部分 Windows/沙箱文件系统会失败，因此降级处理。
    await db.run('PRAGMA foreign_keys = ON;');
    await db.run('PRAGMA busy_timeout = 5000;');
    try {
      const journalMode = await db.get(`PRAGMA journal_mode = ${requestedJournalMode};`);
      console.log(`SQLite journal mode: ${journalMode?.journal_mode || requestedJournalMode}`);
    } catch (error) {
      console.warn(`SQLite WAL mode unavailable, falling back to DELETE journal mode: ${error.message}`);
      await db.run('PRAGMA journal_mode = DELETE;');
    }

    // 1. 创建 users 用户表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT UNIQUE NOT NULL,
        pair_code TEXT UNIQUE NOT NULL,
        pair_code_created_at TEXT,
        nickname TEXT,
        avatar_url TEXT,
        partner_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 2. 创建 anniversaries 纪念日表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS anniversaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        date_type INTEGER NOT NULL DEFAULT 0,
        is_yearly INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 3. 创建 food_pool 点餐备选菜品池
    await db.exec(`
      CREATE TABLE IF NOT EXISTS food_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tags TEXT,
        category TEXT DEFAULT 'home',
        image_url TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 兼容旧数据库：动态增加 category 和 image_url 列
    try {
      await db.run('ALTER TABLE food_pool ADD COLUMN category TEXT DEFAULT "home";');
      console.log('Successfully added category column to food_pool table.');
    } catch (e) {
      // 已经存在，忽略
    }
    try {
      await db.run('ALTER TABLE food_pool ADD COLUMN image_url TEXT;');
      console.log('Successfully added image_url column to food_pool table.');
    } catch (e) {
      // 已经存在，忽略
    }

    // 4. 创建 food_sessions 点餐投票会话表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS food_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_by INTEGER NOT NULL,
        partner_id INTEGER,
        status TEXT NOT NULL,
        selected_food_id INTEGER,
        result_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (selected_food_id) REFERENCES food_pool(id) ON DELETE SET NULL
      );
    `);

    // 5. 创建 food_votes 点餐投票结果表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS food_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        food_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES food_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (food_id) REFERENCES food_pool(id) ON DELETE CASCADE,
        UNIQUE(session_id, user_id, food_id)
      );
    `);

    // 6. 创建 date_plans 约会行程规划表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS date_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        meeting_time TEXT NOT NULL,
        meeting_location TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        revision_note TEXT,
        created_by INTEGER NOT NULL,
        partner_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 7. 创建 date_wishlist 约会愿望单表 (灵感池)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS date_wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 8. 创建 kitchen_sessions 爱心厨房状态表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS kitchen_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_name TEXT NOT NULL,
        diner_id INTEGER NOT NULL,
        chef_id INTEGER NOT NULL,
        diner_note TEXT,
        chef_note TEXT,
        status TEXT NOT NULL,
        image_url TEXT,
        praise TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (diner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (chef_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 9. 创建 calendar_custom_events 日历自定义琐事表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_custom_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL,
        event_time TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 创建核心字段索引，提高查询性能
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
      CREATE INDEX IF NOT EXISTS idx_users_pair_code ON users(pair_code);
      CREATE INDEX IF NOT EXISTS idx_anniversaries_created_by ON anniversaries(created_by);
      CREATE INDEX IF NOT EXISTS idx_food_pool_created_by ON food_pool(created_by);
      CREATE INDEX IF NOT EXISTS idx_food_sessions_created_by_partner_status ON food_sessions(created_by, partner_id, status);
      CREATE INDEX IF NOT EXISTS idx_food_votes_session_user ON food_votes(session_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_date_plans_created_partner_status ON date_plans(created_by, partner_id, status);
      CREATE INDEX IF NOT EXISTS idx_date_wishlist_created_by ON date_wishlist(created_by);
      CREATE INDEX IF NOT EXISTS idx_kitchen_sessions_diner_chef_status ON kitchen_sessions(diner_id, chef_id, status);
      CREATE INDEX IF NOT EXISTS idx_calendar_custom_events_date ON calendar_custom_events(event_date);
    `);

    console.log('Database tables and indices checked/created successfully.');
  } catch (error) {
    console.error('Error initializing SQLite database:', error);
    await closeDBQuietly();

    if (canRecoverEmptyDb && error.code === 'SQLITE_IOERR' && isEmptyDatabaseFile()) {
      console.warn('Detected an empty failed SQLite bootstrap file. Recreating local database...');
      cleanupBootstrapDatabaseFiles();
      return initDBOnce(false);
    }

    throw error;
  }
}

async function closeDBQuietly() {
  if (!db) return;

  try {
    await db.close();
  } catch {
    // Ignore close errors during failed bootstrap cleanup.
  } finally {
    db = null;
  }
}

function isEmptyDatabaseFile() {
  try {
    return fs.existsSync(dbPath) && fs.statSync(dbPath).size === 0;
  } catch {
    return false;
  }
}

function cleanupBootstrapDatabaseFiles() {
  for (const filePath of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to remove bootstrap SQLite file ${filePath}: ${error.message}`);
    }
  }
}
