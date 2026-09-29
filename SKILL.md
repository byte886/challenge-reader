---
name: challenge-reader
description: 人机挑战（CAPTCHA/解锁图）识别辅助，覆盖三类常见挑战并输出对应结果——①文本型：扭曲/干扰字符图片，图像增强后读出字符串交给输入框；②点选型（图标/文字/语义点选）：先读懂图中提示文字（常为彩色、倾斜、水印）或外部指令，再在同一张图内定位目标图标/文字，输出点击坐标（百分比+像素）与置信度；③（预留）滑块/拼图：缺口定位。零训练默认为颜色分割+连通域+归一化模板匹配（旋转扫描 IoU），场景与模板配置驱动；可选 ddddocr / YOLO / VLM 后端。浏览器侧的打开、截图、填值、点击交给浏览器/GUI 控制能力。
compatibility: 文本型增强与点选颜色分割在 macOS(Darwin) 实测；点选核心纯 Node(jpeg-js/pngjs) 可跨平台，提示文字 OCR 默认用 macOS Vision(scripts/ocr_text)，非 macOS 需改用 ddddocr 等后端。执行前先判平台与依赖，不硬跑。
---

# Challenge Reader — 人机挑战识别辅助

先**判定挑战类型**，再走对应分支。本技能只负责"看懂挑战、给出结果（字符串或坐标）"；
浏览器侧的定位、截图、填值、点击、发请求交给浏览器/GUI 控制能力（mac-system-toolkit 的 bu / CDP / cu）。

## 第一步：判定挑战类型

| 挑战长什么样 | 类型 | 输出 | 走哪篇 |
|---|---|---|---|
| 一张扭曲/干扰字符图 + 一个文本输入框 | **文本型 text** | 字符串 | [references/text-challenge.md](references/text-challenge.md) |
| 图中带"请点击图中 XX"提示（彩色斜字/水印）+ 图内若干图标或文字 | **点选型 point-select** | 点击坐标 | [references/point-select.md](references/point-select.md) |
| 可滑动拼图、缺口对齐 | **滑块型 slider** | 缺口位置/轨迹 | 暂用专用滑块方案（预留） |
| 不确定是哪类 / 混合 | 先截图请用户确认，不猜 | — | — |

## 文本型（text）速览

截验证码**元素** → `scripts/enhance_captcha.py` 放大/灰度/对比度/二值化（必要时多版本）→ AI 视觉读字符 → 交浏览器填入。
有时效（2–5 分钟），连续 3 次失败换一张或请人工。细节见 [text-challenge.md](references/text-challenge.md)。

## 点选型（point-select）速览

```text
挑战图
 ├─ A 读提示：彩色掩膜 → 形态学合并/去噪 → PCA 测角 → ±转正 → OCR → 目标 key
 │          （提示由外部文本给出时跳过；文字点选用 ddddocr）
 ├─ B 定位：  目标颜色掩膜 → 连通域+碎片聚合 → 归一化 → 模板旋转扫描 IoU → 候选得分
 └─ C 选择：  按目标 key + 场景规则 → {px,py,x,y,score}；歧义/低置信 → ambiguous，不猜
```

后端选择：固定有限类别且颜色分明 → **零训练模板匹配（默认）**；文字点选/类别开放 → **ddddocr**；
再不行 → YOLO 自训 / VLM。细节见 [point-select.md](references/point-select.md)、
[backends.md](references/backends.md)；接入新场景见 [scenario-guide.md](references/scenario-guide.md)。

## 常用命令

```bash
SKILL_DIR="$HOME/DoubaoWork/skills/challenge-reader"
(cd "$SKILL_DIR/scripts" && npm install)

# 文本型：增强
python3 "$SKILL_DIR/scripts/enhance_captcha.py" /tmp/captcha_raw.png /tmp/captcha_enhanced.png

# 点选型：一步求解（首个内置场景：国史馆 drnh）
node "$SKILL_DIR/scripts/solve.js" <challenge.jpg> \
  --scenario "$SKILL_DIR/scenarios/drnh/scenario.json"
# 提示文本由外部已知时： --text "Please click on the TaiChi icon"
# 输出 result.status=ok 时取 px/py（百分比）；=ambiguous 时看 candidates

# 彩色提示文字预处理 + Vision OCR
python3 "$SKILL_DIR/scripts/prep_colored_text.py" <challenge.jpg> /tmp/p --color yellow
"$SKILL_DIR/scripts/ocr_text" /tmp/p-a.png

# 提取新目标模板（坐标用百分比）
node "$SKILL_DIR/scripts/extract_template.js" <challenge.jpg> /tmp/new.png <px> <py> --color green
```

## 硬红线

- **合规**：仅用于用户本人有权访问的场景——本人账户操作辅助、自身数据采集、RPA、无障碍自动化。
  **不用于绕过他人账户或站点安全访问控制**；遇强制登录、针对人类的安全验证码、明确禁止自动化时
  立即暂停并与用户商量，不破解、不伪造、不绕过。
- **不靠猜**：文本型字符不确定就换一张；点选型低置信或两个候选无法区分时返回 `ambiguous` 并列候选；
  新目标先扩模板、验证后再继续。
- **坐标口径**：点选默认输出相对图片宽高的百分比 `px/py`（0–100），同时给像素 `x/y`；
  点击方负责映射到实际元素/视口。提示 OCR 的 PCA 角度有符号歧义，必须生成 ± 两个转正候选。
- 不回显、不入库 cookie/token/会话值；挑战样本与模板按场景目录管理。
