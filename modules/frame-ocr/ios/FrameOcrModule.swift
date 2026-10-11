import ExpoModulesCore
import UIKit
import Vision

public class FrameOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FrameOcr")

    AsyncFunction("recognizeTextAsync") { (imageUri: String) -> [String] in
      await recognizeText(imageUri: imageUri)
    }
  }
}

/// Runs Vision text recognition on the image at `imageUri` (a `file://` URI
/// or a plain file path) and returns the recognized lines in reading order.
/// Returns an empty array when the image can't be loaded or recognition fails.
private func recognizeText(imageUri: String) async -> [String] {
  let fileURL: URL
  if let url = URL(string: imageUri), url.isFileURL {
    fileURL = url
  } else {
    fileURL = URL(fileURLWithPath: imageUri)
  }

  guard
    let uiImage = UIImage(contentsOfFile: fileURL.path),
    let cgImage = uiImage.cgImage
  else {
    return []
  }

  return await withCheckedContinuation { continuation in
    let request = VNRecognizeTextRequest { request, error in
      guard error == nil else {
        continuation.resume(returning: [])
        return
      }
      let lines = (request.results as? [VNRecognizedTextObservation] ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .filter { !$0.isEmpty }
      continuation.resume(returning: lines)
    }
    request.recognitionLevel = .accurate

    let handler = VNImageRequestHandler(
      cgImage: cgImage,
      orientation: cgOrientation(from: uiImage.imageOrientation),
      options: [:]
    )
    do {
      try handler.perform([request])
    } catch {
      continuation.resume(returning: [])
    }
  }
}

private func cgOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
  switch uiOrientation {
  case .up: return .up
  case .down: return .down
  case .left: return .left
  case .right: return .right
  case .upMirrored: return .upMirrored
  case .downMirrored: return .downMirrored
  case .leftMirrored: return .leftMirrored
  case .rightMirrored: return .rightMirrored
  @unknown default: return .up
  }
}
