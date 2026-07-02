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

    // 1.5 创建 spaces 空间表 和 space_members 成员表
    await db.exec(`
      CREATE TABLE IF NOT EXISTS spaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'group',
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS space_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        space_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TEXT NOT NULL,
        UNIQUE(space_id, user_id),
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

    // 动态升级已有的关系表，增加 space_id / current_space_id 字段
    try {
      await db.run('ALTER TABLE users ADD COLUMN current_space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE anniversaries ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE food_pool ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE food_sessions ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE date_plans ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE kitchen_sessions ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE calendar_custom_events ADD COLUMN space_id INTEGER;');
    } catch (e) {}
    try {
      await db.run('ALTER TABLE date_wishlist ADD COLUMN space_id INTEGER;');
    } catch (e) {}

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
      CREATE INDEX IF NOT EXISTS idx_spaces_code ON spaces(code);
      CREATE INDEX IF NOT EXISTS idx_space_members_space_user ON space_members(space_id, user_id);
    `);

    // 执行历史数据到多空间协作架构的自动平滑迁移
    await migrateToMultiSpace(db);

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

/**
 * 产生唯一的6位空间码
 */
async function generateUniqueSpaceCode(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (true) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const row = await db.get('SELECT id FROM spaces WHERE code = ?', [code]);
    if (!row) {
      return code;
    }
  }
}

/**
 * 历史数据迁移：从原先的 partner_id 双人配对，平滑迁移到 Spaces 空间架构
 */
async function migrateToMultiSpace(db) {
  console.log('Starting data migration to Multi-Space Collaborative architecture...');
  const nowStr = new Date().toISOString();

  // 1. 获取所有没有 current_space_id 的用户
  const users = await db.all('SELECT * FROM users WHERE current_space_id IS NULL OR current_space_id = 0');
  
  for (const user of users) {
    // 再次查询该用户，防止其在前面的循环中已被更新（例如作为伴侣）
    const freshUser = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    if (!freshUser || (freshUser.current_space_id && freshUser.current_space_id !== 0)) {
      continue;
    }

    if (freshUser.partner_id) {
      // 检查伴侣的信息
      const partner = await db.get('SELECT * FROM users WHERE id = ?', [freshUser.partner_id]);
      if (partner) {
        // 创建一个 Group 空间 (情侣也是好友群组的一种，方便扩容)
        const code = await generateUniqueSpaceCode(db);
        const spaceName = `${freshUser.nickname || '用户'}-${partner.nickname || '用户'} 的双人空间`;
        
        const spaceResult = await db.run(
          'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
          [spaceName, code, 'group', freshUser.id, nowStr]
        );
        const spaceId = spaceResult.lastID;

        // 添加成员
        await db.run(
          'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
          [spaceId, freshUser.id, 'admin', nowStr]
        );
        await db.run(
          'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
          [spaceId, partner.id, 'member', nowStr]
        );

        // 更新双方的当前空间
        await db.run('UPDATE users SET current_space_id = ? WHERE id IN (?, ?)', [spaceId, freshUser.id, partner.id]);
        console.log(`Migrated pair: User ${freshUser.id} & User ${partner.id} into Group Space ${spaceId}`);
        continue;
      }
    }

    // 如果是没有配对的单身用户，创建一个 Solo 空间
    const code = await generateUniqueSpaceCode(db);
    const spaceName = `${freshUser.nickname || '用户'} 的个人空间`;
    const spaceResult = await db.run(
      'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      [spaceName, code, 'solo', freshUser.id, nowStr]
    );
    const spaceId = spaceResult.lastID;

    // 添加成员
    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [spaceId, freshUser.id, 'admin', nowStr]
    );

    // 更新当前空间
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, freshUser.id]);
    console.log(`Migrated single user: User ${freshUser.id} into Solo Space ${spaceId}`);
  }

  const businessTables = [
    { table: 'anniversaries', userField: 'created_by' },
    { table: 'food_pool', userField: 'created_by' },
    { table: 'food_sessions', userField: 'created_by' },
    { table: 'date_plans', userField: 'created_by' },
    { table: 'kitchen_sessions', userField: 'chef_id' },
    { table: 'calendar_custom_events', userField: 'created_by' },
    { table: 'date_wishlist', userField: 'created_by' }
  ];

  for (const item of businessTables) {
    const records = await db.all(`SELECT * FROM ${item.table} WHERE space_id IS NULL OR space_id = 0`);
    for (const record of records) {
      const userId = record[item.userField];
      if (userId) {
        const user = await db.get('SELECT current_space_id FROM users WHERE id = ?', [userId]);
        if (user && user.current_space_id) {
          await db.run(`UPDATE ${item.table} SET space_id = ? WHERE id = ?`, [user.current_space_id, record.id]);
        }
      }
    }
    if (records.length > 0) {
      console.log(`Migrated ${records.length} records in table ${item.table} to their corresponding space_ids.`);
    }
  }

  console.log('Data migration complete.');
}

export async function seedDefaultFoods(db, spaceId, userId) {
  const defaultFoods = [
    // 在家吃 (home)
    { name: '西红柿炒鸡蛋', category: 'home', tags: '快手菜,酸甜' },
    { name: '鱼香肉丝', category: 'home', tags: '川菜,下饭' },
    { name: '红烧肉', category: 'home', tags: '本帮菜,大荤' },
    { name: '可乐鸡翅', category: 'home', tags: '甜口,小吃' },
    { name: '宫保鸡丁', category: 'home', tags: '川菜,微辣' },
    { name: '酸菜鱼', category: 'home', tags: '酸辣,大菜' },
    { name: '麻婆豆腐', category: 'home', tags: '川菜,麻辣' },
    { name: '清炒时蔬', category: 'home', tags: '素菜,清淡' },

    // 出去吃 (out)
    { name: '四川火锅', category: 'out', tags: '聚餐,麻辣' },
    { name: '炭烤串串', category: 'out', tags: '夜宵,烧烤' },
    { name: '日式拉面', category: 'out', tags: '面食,清淡' },
    { name: '韩式炸鸡', category: 'out', tags: '高热量,炸物' },
    { name: '经典披萨', category: 'out', tags: '西餐,聚餐' },
    { name: '港式茶餐厅', category: 'out', tags: '粤菜,点心' },
    { name: '多汁汉堡', category: 'out', tags: '快餐,炸物' }
  ];

  const now = new Date().toISOString();
  for (const food of defaultFoods) {
    const existing = await db.get(
      'SELECT id FROM food_pool WHERE name = ? AND space_id = ?',
      [food.name, spaceId]
    );
    if (!existing) {
      await db.run(
        `INSERT INTO food_pool (name, tags, category, created_by, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [food.name, food.tags, food.category, userId, spaceId, now, now]
      );
    }
  }
}

export async function seedDefaultWishlist(db, spaceId, userId) {
  const defaultWishes = [
    '爬山',
    '骑自行车',
    '逛街',
    '旅游',
    '唱歌',
    '打牌'
  ];

  const now = new Date().toISOString();
  for (const name of defaultWishes) {
    const existing = await db.get(
      'SELECT id FROM date_wishlist WHERE name = ? AND space_id = ?',
      [name, spaceId]
    );
    if (!existing) {
      await db.run(
        `INSERT INTO date_wishlist (name, created_by, space_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [name, userId, spaceId, now]
      );
    }
  }
}

export async function ensureUserHasSpace(db, user, now = new Date().toISOString()) {
  if (!user || !user.id) {
    throw new Error('Cannot ensure space for an invalid user.');
  }

  if (user.current_space_id) {
    const currentMembership = await db.get(
      `SELECT sm.space_id
       FROM space_members sm
       JOIN spaces s ON s.id = sm.space_id
       WHERE sm.user_id = ? AND sm.space_id = ?`,
      [user.id, user.current_space_id]
    );
    if (currentMembership) {
      return currentMembership.space_id;
    }
  }

  const memberSpace = await db.get(
    `SELECT sm.space_id
     FROM space_members sm
     JOIN spaces s ON s.id = sm.space_id
     WHERE sm.user_id = ?
     ORDER BY CASE WHEN s.type = 'solo' THEN 0 ELSE 1 END, sm.id
     LIMIT 1`,
    [user.id]
  );
  if (memberSpace) {
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [memberSpace.space_id, user.id]);
    return memberSpace.space_id;
  }

  await db.run('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const existingSpace = await db.get(
      `SELECT sm.space_id
       FROM space_members sm
       JOIN spaces s ON s.id = sm.space_id
       WHERE sm.user_id = ?
       ORDER BY CASE WHEN s.type = 'solo' THEN 0 ELSE 1 END, sm.id
       LIMIT 1`,
      [user.id]
    );
    if (existingSpace) {
      await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [existingSpace.space_id, user.id]);
      await db.run('COMMIT;');
      return existingSpace.space_id;
    }

    const code = await generateUniqueSpaceCode(db);
    const spaceName = `${user.nickname || '用户'} 的个人空间`;
    const spaceResult = await db.run(
      'INSERT INTO spaces (name, code, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
      [spaceName, code, 'solo', user.id, now]
    );
    const spaceId = spaceResult.lastID;

    await db.run(
      'INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [spaceId, user.id, 'admin', now]
    );

    await seedDefaultFoods(db, spaceId, user.id);
    await seedDefaultWishlist(db, spaceId, user.id);
    await db.run('UPDATE users SET current_space_id = ? WHERE id = ?', [spaceId, user.id]);
    await db.run('COMMIT;');

    return spaceId;
  } catch (error) {
    try {
      await db.run('ROLLBACK;');
    } catch (_) {}
    throw error;
  }
}
