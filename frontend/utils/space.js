import { request } from './request.js';

/**
 * 创建一个群组空间
 * @param {string} name 空间名称
 * @returns {Promise<object>} 返回创建成功的空间信息
 */
export function createSpace(name) {
  return request({
    url: '/spaces/create',
    method: 'POST',
    data: { name },
    showLoading: true,
    loadingMsg: '正在创建空间...'
  }).then(data => {
    const app = getApp();
    if (app && data.space) {
      app.globalData.currentSpace = data.space;
      wx.setStorageSync('currentSpace', JSON.stringify(data.space));
    }
    return data;
  });
}

/**
 * 通过邀请码加入空间
 * @param {string} code 6位空间邀请码
 * @returns {Promise<object>} 返回加入成功的空间信息
 */
export function joinSpace(code) {
  return request({
    url: '/spaces/join',
    method: 'POST',
    data: { code },
    showLoading: true,
    loadingMsg: '正在加入空间...'
  }).then(data => {
    const app = getApp();
    if (app && data.space) {
      app.globalData.currentSpace = data.space;
      wx.setStorageSync('currentSpace', JSON.stringify(data.space));
    }
    return data;
  });
}

/**
 * 切换当前的活跃空间
 * @param {number} spaceId 目标空间 ID
 * @returns {Promise<object>} 返回切换后的空间信息
 */
export function switchSpace(spaceId) {
  return request({
    url: '/spaces/switch',
    method: 'POST',
    data: { spaceId },
    showLoading: true,
    loadingMsg: '正在切换空间...'
  }).then(data => {
    const app = getApp();
    if (app && data.space) {
      app.globalData.currentSpace = data.space;
      wx.setStorageSync('currentSpace', JSON.stringify(data.space));
    }
    return data;
  });
}

/**
 * 获取我加入的所有空间列表
 * @returns {Promise<Array>} 返回空间列表
 */
export function getMySpaces() {
  return request({
    url: '/spaces/my',
    method: 'GET'
  }).then(data => {
    const app = getApp();
    if (app && data.spaces) {
      app.globalData.spaces = data.spaces;
    }
    return data.spaces || [];
  });
}

/**
 * 获取当前活跃空间的信息及全部成员列表
 * @returns {Promise<object>} 包含 space 和 members 列表
 */
export function getCurrentSpace() {
  return request({
    url: '/spaces/current',
    method: 'GET'
  }).then(data => {
    const app = getApp();
    if (app && data.space) {
      app.globalData.currentSpace = data.space;
      wx.setStorageSync('currentSpace', JSON.stringify(data.space));
    }
    return data;
  });
}

/**
 * 退出指定空间
 * @param {number} spaceId 空间 ID
 * @returns {Promise<object>} 退出结果
 */
export function leaveSpace(spaceId) {
  return request({
    url: '/spaces/leave',
    method: 'POST',
    data: { spaceId },
    showLoading: true,
    loadingMsg: '正在退出空间...'
  });
}

/**
 * 初始化页面的空间切换器
 * @param {Page} pageInstance 页面实例 (this)
 * @param {Function} onSwitchSuccess 切换成功后的回调，通常用于重新拉取页面数据
 */
export function initSpaceSwitcher(pageInstance, onSwitchSuccess) {
  pageInstance.onTapSpaceSwitcher = function() {
    const app = getApp();
    const spaces = app.globalData.spaces || [];
    if (spaces.length <= 1) {
      getMySpaces().then(loadedSpaces => {
        if (loadedSpaces.length > 1) {
          pageInstance.onTapSpaceSwitcher(); // 重新触发
        } else {
          wx.showToast({ title: '没有其它可切换的空间，可在“我的”页面新建空间', icon: 'none' });
        }
      });
      return;
    }

    const itemList = spaces.map(s => `${s.type === 'solo' ? '👤' : '👥'} ${s.name}`);
    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const index = res.tapIndex;
        const targetSpace = spaces[index];
        if (targetSpace.id === app.globalData.currentSpace?.id) return;

        switchSpace(targetSpace.id).then(() => {
          wx.showToast({ title: '已切换至 ' + targetSpace.name, icon: 'success' });
          
          // 在全局更新缓存
          app.globalData.currentSpace = targetSpace;
          wx.setStorageSync('currentSpace', JSON.stringify(targetSpace));
          
          // 更新页面的当前空间状态
          pageInstance.setData({
            currentSpace: targetSpace
          });

          // 触发成功回调
          if (typeof onSwitchSuccess === 'function') {
            onSwitchSuccess(targetSpace);
          }
        }).catch(err => {
          wx.showToast({ title: err.message || '切换空间失败', icon: 'none' });
        });
      }
    });
  };
}
