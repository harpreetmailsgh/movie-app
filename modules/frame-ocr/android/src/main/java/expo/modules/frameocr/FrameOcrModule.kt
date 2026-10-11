package expo.modules.frameocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class FrameOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FrameOcr")

    AsyncFunction("recognizeTextAsync")
      .SuspendBody { imageUri: String ->
        recognizeText(imageUri)
      }
  }

  /**
   * Runs ML Kit text recognition (Latin) on the image at [imageUri] and
   * returns each recognized line as a separate string, in reading order.
   * Returns an empty list when the image can't be loaded or recognition fails.
   */
  private suspend fun recognizeText(imageUri: String): List<String> {
    val context = appContext.reactContext ?: return emptyList()
    val image = try {
      InputImage.fromFilePath(context, Uri.parse(imageUri))
    } catch (e: Exception) {
      return emptyList()
    }
    return suspendCoroutine { continuation ->
      TextRecognition
        .getClient(TextRecognizerOptions.DEFAULT)
        .process(image)
        .addOnSuccessListener { visionText ->
          val lines = visionText.textBlocks
            .flatMap { block -> block.lines }
            .map { line -> line.text }
            .filter { it.isNotBlank() }
          continuation.resume(lines)
        }
        .addOnFailureListener {
          continuation.resume(emptyList())
        }
    }
  }
}
