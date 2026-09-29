# 接入一个新点选场景（Scenario Guide）

每个点选场景 = 一个目录，含 `scenario.json`（颜色阈值、目标词映射、模板清单、选择规则）
与 `templates/`（模板 PNG）。参照内置 `scenarios/drnh/`。

## 1. 建立场景目录

```text
scenarios/<scene>/
├── scenario.json
└── templates/        # 每类目标一个或多个模板 PNG
```

## 2. 编写 scenario.json

```json
{
  "name": "<scene>",
  "instruction": {
    "colorName": "yellow",
    "color": { "rMin": 170, "gMin": 170, "bMax": 130,
               "chromaExpr": "R+G-2B", "chromaMin": 60 },
    "dilate": 2, "minComponent": 200
  },
  "icons": {
    "color": { "gMin": 170, "rMax": 140, "bMax": 140 },
    "minComponent": 800, "mergeDistance": 160
  },
  "templateDir": "templates",
  "match": { "size": 64, "angleStep": 15, "threshold": 0.6 },
  "specialRules": { "<key>": "nonTargetBelow" },
  "targets": [
    { "key": "xxx", "regex": "xxx|同义词", "templates": ["xxx.png"] }
  ]
}
```

颜色规则字段：`rMin/rMax/gMin/gMax/bMin/bMax`，可选 `chromaExpr:"R+G-2B"` + `chromaMin`。
提示文字若不是彩色斜字（例如外部文本直接给出），运行 solve.js 时用 `--text` 传入即可，
`instruction` 可留默认。

## 3. 采集模板

1. 保存一张含目标的挑战图样本。
2. 先跑 `solve.js` 看 `candidates[].px/py`，找到目标的百分比坐标。
3. 提取模板：
   ```bash
   node scripts/extract_template.js <challenge.jpg> templates/<name>.png <px> <py> --color green
   ```
4. 在 `targets[]` 登记 key、regex、模板文件。

## 4. 验收

- 用 3–5 张不同挑战图跑 `solve.js`：目标应**唯一**选中（status=ok），坐标准确。
- 检查诱饵不被误选：非目标类得分应明显低于阈值。
- 出现模板库外新目标 / 一次 2 个候选无法区分：补模板后重测，不硬上批量。
- 阈值（threshold/颜色/minComponent）按实测调，记录在场景说明里。

## 5. 首个案例：国史馆（drnh）

- 场景：影像页未解锁时返回锁定图（满铺水印 + 斜黄字双语指令 + 4–6 个绿色图标）。
- 已登记 7 类：yinyang 太極、earth 地球、clock 時鐘、gear 齒輪、
  basketball 籃球、mandala 曼陀、tire 輪胎（gear-alt 为齒輪备用模板）。
- 解锁请求由调用方发送：POST `Display/unlock/<px>/<py>`，成功 `"action":1`。
- 该案例的完整项目背景见桌面《蒋中正日记》仓库及其 docs/sop。
