# 可选后端：ddddocr / YOLO / VLM

零训练模板匹配适合"固定有限类别 + 颜色分明"。类别开放、文字点选或模板匹配失效时，按下表升级。

## 1. ddddocr（首选通用后端，文字/图标点选）

大量合成数据训练的 ONNX 模型，开箱即用，带目标检测（`det=True`），适用文字点选与图标点选。

```bash
# 建议独立 venv（onnxruntime 对 Python 版本有要求；本机系统 3.13/3.14 可能不支持，用 3.12）
python3.12 -m venv ~/.venvs/ddddocr && source ~/.venvs/ddddocr/bin/activate
pip install ddddocr opencv-python pillow
```

```python
import ddddocr
det = ddddocr.DdddOcr(det=True, show_ad=False)
with open('challenge.jpg', 'rb') as f:
    img = f.read()
boxes = det.detection(img)          # 文字/图标框 [[x1,y1,x2,y2], ...]

# 文字点选：对每个框裁剪后用分类 OCR 认字，再按提示排序
ocr = ddddocr.DdddOcr(show_ad=False)
# char = ocr.classification(crop_bytes)
```

局限：检测框不含语义类别，图标点选仍需配合模板/分类；模型对陌生风格可能漏检。

## 2. YOLO（ONNX）自训——类别开放、样本充足

YOLOv5/v8 轻量版（n/s），标注后训练，导出 ONNX，CPU 上单图约几十~几百 ms。
适合目标样式稳定但类别较多、颜色分割不稳的场景。

- 标注：LabelImg / Label Studio，几十~几百张即可起步（小样本）。
- 训练后导出：`yolo export model=best.pt format=onnx`。
- 推理可用 `onnxruntime`，输出框 + 类别 + 置信度，阈值通常 0.5。
- 参考：arXiv 2502.13740（YOLOv5/8/10 在 CAPTCHA 上的基准）、2307.15180（YOLOX ensemble）。

## 3. VLM / CLIP——语义级点选

"点击像 X 的东西"、目标难以用模板枚举时：

- CLIP：对候选裁剪图与文本 prompt 算相似度，零样本分类（图标点选常见做法）。
- VLM（如 Qwen/本地视觉模型）：直接给整张图 + 提示，让其输出目标位置；
  注意要求输出**坐标/框**而非仅描述，并做归一化。
- 相关项目：captchakraken（OpenCV + Qwen 视觉模型，含 click/grid）、darkcaptcha（OCR+CLIP）。
- 本地大模型、推理资源与隐私按安全/系统规范执行；不外传敏感图片到不可信端点。

## 4. 后端选择速查

| 情况 | 后端 |
|---|---|
| 固定类别、颜色分明 | 颜色分割 + 模板匹配（默认，零依赖） |
| 文字点选 | ddddocr 检测 + 分类认字 |
| 类别多/开放、有样本 | YOLO(ONNX) |
| 语义描述、难枚举 | CLIP / VLM |
| 都不确定 | 先小样本试 ddddocr，再决定是否自训 |
