import { 配置 } from "./配置.js";
import { 净化文本, 文件名安全 } from "./工具.js";
import { 发布 } from "./事件.js";

/**
 * 900×1200 战报海报：舞台截图 + 战绩数字 + 水印。同源 canvas，不引入跨域。
 * 分享链（YH-076/YH-085 同链合一）：Web Share → 剪贴板口令 → 下载回退。
 */
export function 战报口令({ 状态, 成就, 昵称 }) {
  const 安全昵称 = 文件名安全(昵称 || 配置.战报.默认昵称, 配置.身份.最大长度);
  return `${配置.分享.口令前缀}·${安全昵称}·赞${状态.点赞数}·连${状态.最高连击}·绩${成就.已解锁数}/${成就.总数}`;
}

export async function 分享战报({ 画布, 状态, 成就, 昵称 }) {
  const 口令 = 战报口令({ 状态, 成就, 昵称 });
  const 文本 = 配置.分享.文本模板
    .replace("{成就}", `${成就.已解锁数}/${成就.总数}`)
    .replace("{点赞}", String(状态.点赞数))
    .replace("{连击}", String(状态.最高连击))
    .replace("{口令}", 口令);
  const 回流 = () => 发布("分享", { 口令, 文本 });
  try {
    if (画布 && navigator.canShare) {
      const 文件 = await new Promise((成, 败) => 画布.toBlob((b) => (b ? 成(b) : 败(new Error("空图"))), "image/png"));
      const 包 = new File([文件], "羊来-战报.png", { type: "image/png" });
      if (navigator.canShare({ files: [包] })) {
        await navigator.share({ files: [包], title: 配置.分享.标题, text: 文本 });
        发布("提示", { 文本: 配置.分享.分享成功 });
        回流();
        return true;
      }
    }
    if (navigator.share && !画布) {
      await navigator.share({ title: 配置.分享.标题, text: 文本 });
      发布("提示", { 文本: 配置.分享.分享成功 });
      回流();
      return true;
    }
  } catch (错误) {
    if (String(错误?.name || "") === "AbortError") {
      发布("提示", { 文本: 配置.分享.分享取消 });
      return false;
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${文本}`);
      发布("提示", { 文本: 配置.分享.已复制 });
      回流();
      return true;
    }
  } catch {
  }
  return false;
}

export function 生成战报({ 舞台, 状态, 成就, 昵称 }) {
  try {
    const 宽 = 配置.战报.宽;
    const 高 = 配置.战报.高;
    const 画布 = document.createElement("canvas");
    画布.width = 宽;
    画布.height = 高;
    const 笔 = 画布.getContext("2d");
    if (!笔) throw new Error("canvas 不可用");

    const 渐变 = 笔.createLinearGradient(0, 0, 宽, 高);
    渐变.addColorStop(0, "#1a1028");
    渐变.addColorStop(0.45, "#120d18");
    渐变.addColorStop(1, "#2a1030");
    笔.fillStyle = 渐变;
    笔.fillRect(0, 0, 宽, 高);

    笔.fillStyle = "rgba(255,197,61,0.12)";
    笔.beginPath();
    笔.arc(宽 * 0.85, 120, 220, 0, Math.PI * 2);
    笔.fill();

    笔.fillStyle = "#ffc53d";
    笔.font = `800 42px ${配置.字体.战报栈}`;
    笔.textBaseline = "top";
    笔.fillText(配置.战报.标题, 48, 36);

    笔.fillStyle = "rgba(244,238,251,0.7)";
    笔.font = `600 22px ${配置.字体.战报栈}`;
    const 昵称行 = 文件名安全(昵称 || 配置.战报.默认昵称, 配置.战报.昵称最大字数) + 配置.战报.副标题后缀;
    笔.fillText(昵称行, 48, 92, 宽 - 96);

    const 舞台图 = new Image();
    舞台图.onload = () => {
      try {
        const 框x = 48;
        const 框y = 140;
        const 框宽 = 宽 - 96;
        const 框高 = 520;
        笔.save();
        圆角矩形(笔, 框x, 框y, 框宽, 框高, 24);
        笔.clip();
        const 比例 = Math.max(框宽 / 舞台图.width, 框高 / 舞台图.height);
        const 绘宽 = 舞台图.width * 比例;
        const 绘高 = 舞台图.height * 比例;
        笔.drawImage(舞台图, 框x + (框宽 - 绘宽) / 2, 框y + (框高 - 绘高) / 2, 绘宽, 绘高);
        笔.restore();

        笔.strokeStyle = "rgba(255,197,61,0.45)";
        笔.lineWidth = 3;
        圆角矩形(笔, 框x, 框y, 框宽, 框高, 24);
        笔.stroke();

        画数据(笔, 宽, 状态, 成就);
        画水印(笔, 宽, 高);

        分享战报({ 画布, 状态, 成就, 昵称 }).then((已分享) => {
          if (已分享) {
            发布("战报");
            return;
          }
          const 链接 = document.createElement("a");
          链接.href = 画布.toDataURL("image/png");
          const 安全昵称 = 文件名安全(昵称 || 配置.战报.默认昵称, 配置.身份.最大长度);
          链接.download = `${配置.战报.文件前缀}${安全昵称}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.png`;
          链接.click();
          发布("提示", { 文本: 配置.文案.战报已保存 });
          发布("战报");
        });
      } catch {
        发布("提示", { 文本: 配置.文案.战报失败 });
      }
    };
    舞台图.onerror = () => 发布("提示", { 文本: 配置.文案.战报失败 });
    舞台图.src = 舞台.截图();
  } catch {
    发布("提示", { 文本: 配置.文案.战报失败 });
  }
}

function 画数据(笔, 宽, 状态, 成就) {
  const 标 = 配置.战报.字段标签;
  const 项 = [
    [标.获赞, String(状态.点赞数)],
    [标.被砸, String(状态.投掷数)],
    [标.献礼, String(状态.献礼数)],
    [标.最高连击, String(状态.最高连击)],
    [标.好感, String(Math.round(状态.好感))],
    [标.称号, 状态.称号],
    [标.人气, String(Math.round(状态.人气显示))],
    [标.成就, `${成就.已解锁数}/${成就.总数}`],
  ];
  const 列宽 = (宽 - 96) / 3;
  项.forEach((条, i) => {
    const 列 = i % 3;
    const 行 = Math.floor(i / 3);
    const x = 48 + 列 * 列宽;
    const y = 700 + 行 * 150;
    笔.fillStyle = "rgba(255,255,255,0.06)";
    圆角矩形(笔, x, y, 列宽 - 16, 128, 16);
    笔.fill();
    笔.fillStyle = "rgba(244,238,251,0.55)";
    笔.font = `600 18px ${配置.字体.战报栈}`;
    笔.fillText(条[0], x + 18, y + 22);
    笔.fillStyle = "#ffc53d";
    笔.font = `800 36px ${配置.字体.战报栈}`;
    const 最大值宽 = 列宽 - 52;
    let 值文本 = String(条[1]);
    if (笔.measureText(值文本).width > 最大值宽) {
      while (值文本.length > 1 && 笔.measureText(值文本 + "…").width > 最大值宽) 值文本 = 值文本.slice(0, -1);
      值文本 += "…";
    }
    笔.fillText(值文本, x + 18, y + 58, 最大值宽);
  });
}

function 画水印(笔, 宽, 高) {
  笔.fillStyle = "rgba(255,197,61,0.85)";
  笔.font = `700 20px ${配置.字体.战报栈}`;
  笔.textAlign = "center";
  笔.fillText(配置.战报.水印, 宽 / 2, 高 - 48);
  笔.fillStyle = "rgba(244,238,251,0.4)";
  笔.font = `500 14px ${配置.字体.战报栈}`;
  笔.fillText(配置.战报.副水印, 宽 / 2, 高 - 24);
  笔.textAlign = "left";
}

function 圆角矩形(笔, x, y, w, h, r) {
  笔.beginPath();
  笔.moveTo(x + r, y);
  笔.arcTo(x + w, y, x + w, y + h, r);
  笔.arcTo(x + w, y + h, x, y + h, r);
  笔.arcTo(x, y + h, x, y, r);
  笔.arcTo(x, y, x + w, y, r);
  笔.closePath();
}
