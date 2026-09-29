// OCR 图片中的文字（macOS Vision，中英繁简）
// 用法: swift ocr_text.swift <image>   （编译: swiftc ocr_text.swift -o ocr_text）
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { fputs("usage: ocr_text <image>\n", stderr); exit(1) }
let url = URL(fileURLWithPath: args[1])
guard let img = NSImage(contentsOf: url),
      let tiff = img.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cg = bitmap.cgImage else {
    fputs("cannot load image\n", stderr); exit(1)
}

let req = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    for obs in observations {
        if let cand = obs.topCandidates(1).first {
            let b = obs.boundingBox
            print(String(format: "[%.2f,%.2f,%.2f,%.2f] %@",
                         b.minX, b.minY, b.width, b.height, cand.string))
        }
    }
}
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true
req.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([req]) } catch { fputs("perform error: \(error)\n", stderr); exit(1) }
