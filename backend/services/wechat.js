import dotenv from 'dotenv';

dotenv.config();

const APPID = process.env.WECHAT_APPID;
const SECRET = process.env.WECHAT_SECRET;

/**
 * 微信 code 换取 openid 和 session_key
 * @param {string} code 微信小程序/App 登录获取的临时凭证
 * @param {string} platform 平台标识，'mp' 为小程序，'app' 为 Android/iOS App
 * @returns {Promise<{ openid: string, session_key: string|null, unionid: string|null }>}
 */
export async function code2Session(code, platform = 'mp') {
  let appId = process.env.WECHAT_APPID;
  let secret = process.env.WECHAT_SECRET;

  if (platform === 'app') {
    appId = process.env.ANDROID_APP_APPID || process.env.WECHAT_APPID;
    secret = process.env.ANDROID_APP_SECRET || process.env.WECHAT_SECRET;
  }

  // 如果未配置微信密钥，或 code 是 mock_ 开头，则进入本地 Mock 调试模式
  const isMockEnv = !appId || !secret || appId.includes('mock') || secret.includes('mock') || appId.includes('your_wechat');
  const isMockCode = code && code.startsWith('mock_');

  if (isMockEnv || isMockCode) {
    // 真机发送的真实 code (没有 mock_ 前缀) 映射为固定的测试账号以防止用户变动
    const isRealPhoneCode = code && !code.startsWith('mock_');
    const mockOpenid = isRealPhoneCode 
      ? 'mock_openid_phone_test' 
      : `mock_openid_${code ? code.replace('mock_', '') : 'default_user'}`;

    console.log(`[WeChat Service] 启用 Mock 登录模式. Platform: ${platform}, Code: ${code} => OpenID: ${mockOpenid}`);
    return {
      openid: mockOpenid,
      session_key: 'mock_session_key_for_local_debugging',
      unionid: 'mock_unionid_for_debugging'
    };
  }

  // 微信授权接口针对小程序与原生 App 分别使用不同的验证 URL
  let url = '';
  if (platform === 'app') {
    url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`;
  } else {
    url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.errcode) {
      throw new Error(`微信登录接口报错: [${data.errcode}] ${data.errmsg}`);
    }

    return {
      openid: data.openid,
      session_key: data.session_key || null,
      unionid: data.unionid || null
    };
  } catch (error) {
    console.error(`[WeChat Service] code2Session 失败 (${platform}):`, error);
    throw error;
  }
}

/**
 * 发送微信订阅消息给指定用户 (例如约会提案状态变动推送)
 * @param {string} touser 接收者的 openid
 * @param {string} templateId 订阅消息模板 ID
 * @param {string} page 点击模板卡片后跳转的小程序页面路径
 * @param {object} data 模板填充的数据内容，格式符合微信规范
 * @returns {Promise<object>}
 */
export async function sendSubscribeMessage(touser, templateId, page, data) {
  const isMockEnv = !APPID || !SECRET || APPID.includes('mock') || SECRET.includes('mock') || APPID.includes('your_wechat');
  
  if (isMockEnv) {
    console.log(`[WeChat Service] 模拟发送订阅消息:
    - 接收者 OpenID: ${touser}
    - 模板 ID: ${templateId}
    - 跳转页面: ${page}
    - 数据内容:`, JSON.stringify(data));
    return { success: true, mock: true };
  }

  try {
    // 1. 获取微信 API 访问凭证 Access Token
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    
    if (tokenData.errcode) {
      throw new Error(`获取 AccessToken 失败: [${tokenData.errcode}] ${tokenData.errmsg}`);
    }

    const accessToken = tokenData.access_token;

    // 2. 调用微信官方 subscribeMessage.send 接口
    const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;
    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser,
        template_id: templateId,
        page,
        data,
        miniprogram_state: 'developer' // 跳转小程序开发版/体验版/正式版
      })
    });

    const sendData = await response.json();
    if (sendData.errcode !== 0) {
      console.warn(`[WeChat Service] 微信官方发送订阅消息失败: [${sendData.errcode}] ${sendData.errmsg}`);
      return { success: false, ...sendData };
    }

    console.log(`[WeChat Service] 成功向用户 ${touser} 发送订阅消息`);
    return { success: true, ...sendData };
  } catch (error) {
    console.error('[WeChat Service] 发送订阅消息出现异常:', error);
    return { success: false, error: error.message };
  }
}
