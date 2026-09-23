/**
 * 旧存储键迁移（品牌更名专用）
 *
 * 品牌由「蜂来」更名为「阳来」后，本机 localStorage 里以「蜂来_」开头的存档键
 * （昵称、战绩、成就、主题、未成年、面板偏移…）整体换成「阳来_」开头，
 * 老用户数据不丢。仅在启动最前面跑一次，迁完即删旧键。
 *
 * 新键已存在时不覆盖，避免把回退场景里刚写入的新数据冲掉。
 */
const 旧前缀 = "蜂" + "来" + "_";
const 新前缀 = "阳" + "来" + "_";

export function 迁移旧存储键() {
  let 迁移数 = 0;
  try {
    const 旧键表 = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const 键 = localStorage.key(i);
      if (键 && 键.startsWith(旧前缀)) 旧键表.push(键);
    }
    for (const 旧键 of 旧键表) {
      const 新键 = 新前缀 + 旧键.slice(旧前缀.length);
      const 值 = localStorage.getItem(旧键);
      if (值 != null && localStorage.getItem(新键) == null) localStorage.setItem(新键, 值);
      localStorage.removeItem(旧键);
      迁移数 += 1;
    }
  } catch {
    // 隐私模式 / 禁用存储：静默跳过，不影响开播
  }
  return 迁移数;
}
