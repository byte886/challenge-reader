# challenge-reader

人机挑战（CAPTCHA / 解锁图）识别辅助技能。按挑战类型分流：

| 类型 | 输入 → 输出 | 入口 |
|---|---|---|
| 文本型 text | 扭曲字符图 → 字符串（填入输入框） | [references/text-challenge.md](references/text-challenge.md) |
| 点选型 point-select | 带提示的挑战图 → 目标点击坐标 | [references/point-select.md](references/point-select.md) |
| 滑块型 slider | 拼图 → 缺口位置/轨迹（预留） | — |

点选型默认走零训练路线（颜色分割 + 连通域 + 归一化模板匹配，旋转扫描 IoU），场景与模板配置驱动；
可选 ddddocr / YOLO / VLM 后端。浏览器侧动作（打开、截图、填值、点击）复用浏览器/GUI 控制能力，
本技能只产出识别结果。

## 使用

这是豆包（及兼容 Agent）的本地技能。完整能力、触发场景与路由见入口 [`SKILL.md`](SKILL.md)，
Agent 命中时首先读取；下列子目录按需加载。

## 目录

```text
SKILL.md                         入口与类型路由
references/
  text-challenge.md              文本型：截图→增强→读取→填入
  point-select.md                点选型：读提示→定位→坐标
  backends.md                    ddddocr / YOLO / VLM 可选后端
  scenario-guide.md              接入新点选场景
scripts/
  enhance_captcha.py             文本型图像增强
  solve.js                       点选型一步求解 CLI
  lib_pointselect.js             点选核心库（配置驱动）
  prep_colored_text.py           彩色提示文字预处理
  ocr_text / ocr_text.swift      Vision OCR（二进制+源码）
  extract_template.js            新模板提取
scenarios/
  drnh/                          首个案例：国史馆影像锁定图（scenario.json + templates/）
```

## 许可

[MIT](LICENSE) © 2026 byte886
