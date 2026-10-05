# 验证码识别 SOP（定位 → 截图 → 增强 → 读取 → 填入）

> 浏览器侧动作（打开页面、定位元素、对元素截图、填值、点击）统一交给浏览器控制能力（mac-system-toolkit，按其当前可用栈：bu plane / Playwright / CDP）。本技能只负责图像增强与识别，不绑定具体 CLI 语法、也不复制其命令。
> 交接物约定：① 对验证码 `<img>` 元素截图存 `/tmp/captcha_raw.png`；② 拿到输入框与提交按钮定位；③ 把识别出的字符串填进输入框并提交。

## 1. 定位验证码元素

用浏览器控制能力取页面无障碍快照，按关键词定位验证码图片与输入框：

- 快照里按 `captcha|challenge|characters|验证码` 等关键词找验证码 `<img>` 与输入框元素；
- 具体 snapshot / 定位命令用浏览器控制能力（mac-system-toolkit）的当前用法，本技能不写死。

验证码通常包含：
- 一个 `img` 元素（alt 含 "Image challenge" / "captcha" / "验证码"）
- 一个 `textbox`（placeholder 含 "Type the characters" / "验证码"）
- 可能有 "New Code" / "新代码" 按钮用于换一张

## 2. 截取验证码图片

用浏览器控制能力对步骤 1 定位到的验证码 `<img>` **元素截图**（截元素而非整屏，避免背景噪声），存成 `/tmp/captcha_raw.png`，供步骤 3 增强。

## 3. 图像增强

运行增强脚本 `scripts/enhance_captcha.py` 生成放大、高对比度版本：

```bash
# $SKILL_DIR 为本技能实际安装目录（同一套技能可能安装在 ~/Doubao/skills、
# ~/DoubaoWork/skills 或其它路径，不写死单一位置；以技能加载返回的实际路径为准）
SKILL_DIR="<本技能安装目录>"

# 基础增强（灰度 + 6x放大 + 对比度2.5 + 锐化）
python3 "$SKILL_DIR/scripts/enhance_captcha.py" /tmp/captcha_raw.png /tmp/captcha_enhanced.png

# 如果基础增强仍看不清，尝试二值化（黑白）
python3 "$SKILL_DIR/scripts/enhance_captcha.py" /tmp/captcha_raw.png /tmp/captcha_bw.png --threshold

# 更大放大倍数 + 更高对比度
python3 "$SKILL_DIR/scripts/enhance_captcha.py" /tmp/captcha_raw.png /tmp/captcha_big.png --scale 8 --contrast 3.0

# 反色（浅色背景深色文字时尝试）
python3 "$SKILL_DIR/scripts/enhance_captcha.py" /tmp/captcha_raw.png /tmp/captcha_inv.png --invert
```

## 4. AI 视觉读取

用 `Read` 工具查看增强后的图片（`thumbnail_size: "full"`），识别验证码字符。

**识别技巧：**
- 优先看基础增强版本；模糊时再看二值化版本交叉验证
- 注意区分易混淆字符：0/O、1/I/l、2/Z、5/S、8/B、G/6、Y/V
- 如果不确定，点击 "New Code" 换一张更清晰的验证码重试
- 验证码不区分大小写（除非页面明确说明）

## 5. 填入并提交

用浏览器控制能力把识别字符串填进验证码输入框，等提交按钮启用后点击：

- 填值后按钮仍禁用时，先 snapshot 确认是否还有别的必填项、或验证码尚未被页面判为有效；
- 具体 fill / click 命令用浏览器控制能力（mac-system-toolkit）的当前用法。

## 6. 验证结果

提交后检查页面：
- 成功：页面跳转或进入下一步
- 失败：出现 "incorrect" / "错误" / "try again" 提示 → 换一张验证码重试（回到步骤 2）
- 网络错误：出现 "could not be completed because of an error" → 等待后重试

## 多版本对比策略

当验证码难以辨认时，一次性生成多个增强版本对比读取：

```bash
SKILL_DIR="<本技能安装目录>"   # 若同一会话上方已定义可省略
python3 "$SKILL_DIR/scripts/enhance_captcha.py" raw.png enhanced.png
python3 "$SKILL_DIR/scripts/enhance_captcha.py" raw.png bw.png --threshold
python3 "$SKILL_DIR/scripts/enhance_captcha.py" raw.png big.png --scale 8 --contrast 3.5
```

逐个 Read 三张图，取一致识别结果。

## 注意事项

- 验证码有时效性，截取后尽快识别填入（通常 2-5 分钟过期）
- 每次换验证码后 ref 可能变化，需重新 snapshot
- 部分验证码有背景干扰线/噪点，`--threshold` 二值化通常能有效去除
- 如果连续 3 次识别失败，建议换一张验证码或请用户人工输入
