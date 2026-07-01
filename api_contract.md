# EatToday API Contract

本文件用于约定前后端数据结构。前端开发期默认走 `frontend/utils/config.js` 里的 `USE_MOCK = true`；后端接口完成后，将对应 mock 切到真实接口即可。

## 通用约定

请求头：
* 登录后请求携带 `Authorization: Bearer <token>`
* 请求和响应均使用 JSON

错误格式：
```json
{
  "error": "ValidationError",
  "message": "错误说明"
}
```

## 用户与配对

### POST `/api/auth/login`
请求：
```json
{
  "code": "wx.login 返回的 code",
  "nickname": "昵称",
  "avatarUrl": "头像地址"
}
```

响应：
```json
{
  "token": "登录凭证",
  "user": {
    "id": 1,
    "pair_code": "LOV520",
    "nickname": "本地测试用户",
    "avatar_url": "",
    "partner_id": null,
    "created_at": "2026-06-30T00:00:00.000Z",
    "updated_at": "2026-06-30T00:00:00.000Z"
  }
}
```

### GET `/api/auth/me`
响应：
```json
{
  "user": {},
  "partner": null
}
```

### POST `/api/auth/pair`
请求：
```json
{
  "pairCode": "TA520"
}
```

响应：
```json
{
  "success": true,
  "message": "配对成功",
  "partner": {}
}
```

### POST `/api/auth/unpair`
响应：
```json
{
  "success": true,
  "message": "已解除情侣绑定关系"
}
```

## 首页聚合

### GET `/api/food/today`
响应：
```json
{
  "food": {
    "id": 1,
    "name": "火锅",
    "reason": "random"
  }
}
```

### GET `/api/date/today`
响应：
```json
{
  "plan": {
    "id": 1,
    "title": "一起去公园散步",
    "meeting_time": "2026-06-30 16:00",
    "meeting_location": "滨江公园",
    "status": "accepted"
  }
}
```

### GET `/api/anniversary/nearest`
响应：
```json
{
  "anniversary": {
    "id": 1,
    "title": "我们第一次相遇",
    "date": "2025-05-20",
    "is_yearly": 1,
    "daysLeft": 324
  }
}
```

## 纪念日

### GET `/api/anniversary`
响应：
```json
{
  "anniversaries": []
}
```

### POST `/api/anniversary`
请求：
```json
{
  "title": "恋爱纪念日",
  "date": "2026-05-20",
  "dateType": 0,
  "isYearly": 1
}
```

响应：
```json
{
  "success": true,
  "anniversary": {}
}
```

### DELETE `/api/anniversary/:id`
响应：
```json
{
  "success": true,
  "message": "纪念日记录删除成功"
}
```

## 食物池与投票

### GET `/api/food`
响应：
```json
{
  "foods": [
    {
      "id": 1,
      "name": "火锅",
      "tags": "热闹,辣",
      "image_url": "https://...", // 美食照片路径或 base64
      "category": "home" // "home" (爱心私房菜) 或 "out" (风味寻宝图)
    }
  ]
}
```

### POST `/api/food`
请求：
```json
{
  "name": "火锅",
  "tags": "热闹,辣",
  "image_url": "https://...", // 可选
  "category": "home" // "home" 或 "out"，默认 "home"
}
```

响应：
```json
{
  "success": true,
  "food": {}
}
```

### PUT `/api/food/:id`
请求：
```json
{
  "name": "新火锅",
  "tags": "特辣",
  "image_url": "https://...",
  "category": "out"
}
```

响应：
```json
{
  "success": true,
  "food": {}
}
```

### DELETE `/api/food/:id`
响应：
```json
{
  "success": true,
  "message": "删除成功"
}
```

### POST `/api/food/lock-wheel`
请求：
```json
{
  "foodId": 1
}
```

响应：
```json
{
  "success": true,
  "message": "已锁定今日美食",
  "session": {}
}
```

### POST `/api/food/session`
响应：
```json
{
  "session": {
    "id": 1,
    "status": "voting",
    "selected_food_id": null,
    "selected_food_name": "",
    "result_reason": ""
  }
}
```

### GET `/api/food/session/active`
响应：
```json
{
  "session": {},
  "votes": []
}
```

### POST `/api/food/session/:id/vote`
请求：
```json
{
  "foodIds": [1, 2, 3]
}
```

响应：
```json
{
  "success": true,
  "session": {}
}
```

## 约会计划

### GET `/api/date`
响应：
```json
{
  "plans": []
}
```

### POST `/api/date`
请求：
```json
{
  "title": "周末去看电影",
  "meetingTime": "2026-07-04 19:30",
  "meetingLocation": "万达影城",
  "notes": "提前买爆米花",
  "status": "accepted" // 可选，餐饮联动自动生成时直接传 "accepted"
}
```

响应：
```json
{
  "success": true,
  "plan": {}
}
```

### POST `/api/date/:id/accept`
### POST `/api/date/:id/reject`
响应：
```json
{
  "success": true,
  "message": "操作成功",
  "plan": {}
}
```

### POST `/api/date/:id/revision`
请求：
```json
{
  "revisionNote": "改到 19:00 好不好？"
}
```

响应：
```json
{
  "success": true,
  "message": "操作成功",
  "plan": {}
}
```

### DELETE `/api/date/:id`
响应：
```json
{
  "success": true,
  "message": "行程记录删除/撤销成功"
}
```

## 约会愿望单

### GET `/api/date/wishlist`
响应：
```json
{
  "wishlist": []
}
```

### POST `/api/date/wishlist`
请求：
```json
{
  "name": "去海洋馆看水母"
}
```

响应：
```json
{
  "success": true,
  "wish": {}
}
```

### DELETE `/api/date/wishlist/:id`
响应：
```json
{
  "success": true,
  "message": "愿望项目已移除"
}
```

## 爱心厨房

### GET `/api/kitchen/active`
响应：
```json
{
  "session": {
    "id": 1,
    "dish_name": "红烧肉",
    "diner_id": 1,
    "chef_id": 2,
    "diner_note": "少放糖，加个蛋",
    "status": "ordered",
    "chef_note": "",
    "image_url": "",
    "praise": "",
    "created_at": "2026-06-30T07:00:00Z"
  }
}
```

### POST `/api/kitchen/order`
请求：
```json
{
  "dishName": "红烧肉",
  "dinerNote": "少放糖，加个蛋"
}
```
响应：
```json
{
  "success": true,
  "session": {}
}
```

### POST `/api/kitchen/accept`
响应：
```json
{
  "success": true,
  "message": "主厨已接单，下厨中",
  "session": {}
}
```

### POST `/api/kitchen/serve`
请求：
```json
{
  "chefNote": "大功告成，爱心餐点出锅啦！",
  "imageUrl": "/images/cooked_dish.jpg"
}
```
响应：
```json
{
  "success": true,
  "message": "装盘起锅成功",
  "session": {}
}
```

### POST `/api/kitchen/praise`
请求：
```json
{
  "praise": "太美味了，不愧是我宝贝！"
}
```
响应：
```json
{
  "success": true,
  "message": "已评价并送上赞美",
  "session": {}
}
```

### POST `/api/kitchen/reset`
响应：
```json
{
  "success": true,
  "message": "爱心厨房会话重置完成"
}
```
