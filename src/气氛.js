import { 配置, 随机取, 取道具 } from "./配置.js";
import { 随机, 随机整数, 净化文本, 填词 } from "./工具.js";
import { 发布, 订阅 } from "./事件.js";

const 名次图标 = ["🥇", "🥈", "🥉"];

/** 造一个 NPC 观众名，和弹幕气氛组用同一套池子 */
function 造观众名() {
  const 底 = 随机取(配置.观众.昵称池);
  if (Math.random() < 配置.观众.加后缀概率) {
    return `${底}${随机取(配置.观众.后缀池)}${随机整数(2, 99)}`;
  }
  return 底;
}

/**
 * 直播间气氛组：观众进场提示、送礼演出提示条、本场热度榜。
 * 全部是前端演出，不进后端；榜单只记这一场的送礼演出数；送礼=气氛演出，无实际支付。
 */
export class 气氛系统 {
  constructor({ 进场层, 礼物层, 榜单, 榜单标题, 取昵称 }) {
    this.进场层 = 进场层;
    this.礼物层 = 礼物层;
    this.榜单 = 榜单;
    this.榜单标题 = 榜单标题;
    this.取昵称 = 取昵称;
    this.榜表 = new Map();
    this.我的昵称 = "";
    this.我的礼物数 = 0;
    this.上榜提示过 = false;
    this.进场计时 = 随机(2, 4);
    this.送礼计时 = 随机(...配置.观众.送礼间隔秒);
    this.绑定();
    this.刷新榜单();
  }

  绑定() {
    // 投送类道具算「送礼演出」，投掷是砸人，不进榜
    订阅("道具命中", ({ 道具 }) => {
      if (道具?.分类 !== "投送") return;
      this.记礼物(道具, 净化文本(this.取昵称() || "", 配置.身份.最大长度) || 配置.身份.跳过前缀, true);
    });
  }

  更新(步长) {
    if (!配置.礼物.开启) return;
    this.进场计时 -= 步长;
    if (this.进场计时 <= 0) {
      this.进场计时 = 随机(...配置.观众.进场间隔秒);
      this.进场一次();
    }
    this.送礼计时 -= 步长;
    if (this.送礼计时 <= 0) {
      this.送礼计时 = 随机(...配置.观众.送礼间隔秒);
      if (Math.random() < 配置.观众.送礼概率) this.送礼一次();
    }
  }

  进场一次() {
    if (!配置.观众.进场提示 || !this.进场层) return;
    if (this.进场层.childElementCount >= 配置.观众.进场同屏上限) return;
    const 元素 = document.createElement("div");
    元素.className = "进场签";
    元素.textContent = 填词(配置.文案.进场, {
      前缀: 配置.观众.进场前缀,
      昵称: 造观众名(),
      文案: 随机取(配置.观众.进场文案),
    });
    this.进场层.appendChild(元素);
    setTimeout(() => 元素.remove(), 配置.观众.进场存活秒 * 1000);
  }

  /** NPC 观众偶尔送一份小礼物，把直播间垫热 */
  送礼一次() {
    const 名 = 随机取(配置.观众.送礼礼物池);
    const 道具 = 取道具(名);
    if (!道具) return;
    this.记礼物(道具, 造观众名(), false);
  }

  记礼物(道具, 昵称, 自己) {
    if (!配置.礼物.开启 || !道具) return;
    const 名 = 净化文本(昵称 || "", 配置.身份.最大长度) || 配置.身份.跳过前缀;
    if (自己) this.我的昵称 = 名;
    const 条 = this.榜表.get(名) || { 数量: 0, 道具: null };
    条.数量++;
    条.道具 = 道具;
    this.榜表.set(名, 条);
    if (自己) this.我的礼物数++;

    this.放提示(道具, 名, 自己);
    this.刷新榜单();
    发布("礼物", { 道具, 昵称: 名, 自己 });

    if (自己 && !this.上榜提示过 && this.我的礼物数 >= 配置.礼物.榜单最小基数 && this.榜第一名 === 名) {
      this.榜单待提示 = (this.榜单待提示 || 0) + 1;
      if (this.榜单待提示 >= 1) {
        clearTimeout(this.榜单延迟计时);
        this.榜单延迟计时 = setTimeout(() => {
          if (this.榜第一名 === 名 && this.我的礼物数 >= 配置.礼物.榜单最小基数) {
            this.上榜提示过 = true;
            发布("上榜");
          }
          this.榜单待提示 = 0;
        }, 配置.礼物.榜单延迟秒 * 1000);
      }
    }

    if (自己 && Math.random() < 配置.礼物.主播回应概率) {
      发布("台词", { 文本: 随机取(配置.礼物.主播回应池), 强制: true });
    }
  }

  放提示(道具, 昵称, 自己) {
    if (!this.礼物层) return;
    while (this.礼物层.childElementCount >= 配置.礼物.同屏上限) {
      this.礼物层.firstElementChild?.remove();
    }
    const 元素 = document.createElement("div");
    元素.className = "礼物签" + (自己 ? " 我的" : "") + (配置.礼物.全屏演出.includes(道具.id) ? " 豪华" : "");
    元素.dataset.gift = 道具.id;

    const 图标 = document.createElement("b");
    图标.className = "礼物图";
    图标.textContent = 道具.emoji;

    const 文本 = document.createElement("span");
    文本.className = "礼物文";
    文本.textContent = 填词(配置.礼物.送出文案, { 昵称: 昵称, 道具: 道具.id, 数量: 1 });

    元素.append(图标, 文本);
    this.礼物层.appendChild(元素);
    setTimeout(() => 元素.remove(), 配置.礼物.提示存活秒 * 1000);
  }

  get 榜第一名() {
    let 名 = null;
    let 数 = 0;
    for (const [键, 条] of this.榜表) {
      if (条.数量 > 数) {
        数 = 条.数量;
        名 = 键;
      }
    }
    return 名;
  }

  刷新榜单() {
    if (!this.榜单) return;
    const 排 = [...this.榜表.entries()].sort((a, b) => b[1].数量 - a[1].数量).slice(0, 配置.礼物.榜单条数);
    const 签名 = 排.map(([名, 条]) => `${名}=${条.数量}`).join("|");
    if (this.上次榜单签名 === 签名) return;
    this.上次榜单签名 = 签名;
    this.榜单标题?.replaceChildren(配置.礼物.榜单标题);
    this.榜单.replaceChildren();
    if (!排.length) {
      const 空 = document.createElement("div");
      空.className = "榜单空";
      空.textContent = 配置.礼物.榜单空位;
      this.榜单.appendChild(空);
      return;
    }
    排.forEach(([名, 条], i) => {
      const 行 = document.createElement("div");
      行.className = "榜单行" + (名 === this.我的昵称 ? " 我的" : "");
      const 位 = document.createElement("i");
      位.textContent = 名次图标[i] || String(i + 1);
      const 谁 = document.createElement("span");
      谁.className = "榜单名";
      谁.textContent = 名;
      const 多少 = document.createElement("b");
      多少.textContent = `${条.数量}`;
      行.append(位, 谁, 多少);
      this.榜单.appendChild(行);
    });
  }
}
