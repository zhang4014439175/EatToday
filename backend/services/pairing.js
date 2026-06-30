import crypto from 'crypto';

/**
 * 随机生成 6 位大写字母加数字组成的唯一配对码
 * @param {object} db SQLite 数据库实例
 * @returns {Promise<string>}
 */
export async function generateUniquePairCode(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符如 I, O, 1, 0
  let code = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 100) {
    code = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      code += chars[randomIndex];
    }

    // 检查库中是否已存在该配对码
    const existingUser = await db.get('SELECT id FROM users WHERE pair_code = ?', [code]);
    if (!existingUser) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('无法生成唯一的配对码，请稍后再试');
  }

  return code;
}

/**
 * 在事务中双向绑定情侣关系
 * @param {object} db SQLite 数据库实例
 * @param {number} userId1 用户 1 的 ID
 * @param {number} userId2 用户 2 的 ID
 */
export async function bindPartnerTransaction(db, userId1, userId2) {
  if (userId1 === userId2) {
    throw new Error('不能与自己绑定');
  }

  // 开启 SQLite 事务
  await db.run('BEGIN TRANSACTION;');

  try {
    // 锁定并获取两个用户当前的状态
    const user1 = await db.get('SELECT partner_id FROM users WHERE id = ?', [userId1]);
    const user2 = await db.get('SELECT partner_id FROM users WHERE id = ?', [userId2]);

    if (!user1 || !user2) {
      throw new Error('参与绑定的用户不存在');
    }

    if (user1.partner_id) {
      throw new Error('您已经绑定了伴侣，无法重复绑定');
    }

    if (user2.partner_id) {
      throw new Error('对方已经绑定了伴侣，无法接受您的绑定');
    }

    const now = new Date().toISOString();

    // 更新用户 1 的 partner_id
    await db.run(
      'UPDATE users SET partner_id = ?, updated_at = ? WHERE id = ?',
      [userId2, now, userId1]
    );

    // 更新用户 2 的 partner_id
    await db.run(
      'UPDATE users SET partner_id = ?, updated_at = ? WHERE id = ?',
      [userId1, now, userId2]
    );

    // 提交事务
    await db.run('COMMIT;');
  } catch (error) {
    // 发生异常回滚事务
    await db.run('ROLLBACK;');
    throw error;
  }
}
