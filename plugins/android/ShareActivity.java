package __PACKAGE_NAME__;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Headless trampoline activity for Android share intents (ACTION_SEND, text/plain).
 * Extracts the first URL from the shared text and hands it to the app through the
 * same deep link the iOS share extension uses:
 *   movierecommender://import?sharedUrl=<url>
 * No UI — declared with a translucent theme and finishes immediately.
 */
public class ShareActivity extends Activity {
  private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s)]+");

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    String url = null;
    Intent intent = getIntent();
    if (intent != null) {
      String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
      if (sharedText != null) {
        Matcher matcher = URL_PATTERN.matcher(sharedText);
        if (matcher.find()) {
          url = matcher.group();
        }
      }
    }
    if (url != null) {
      Intent view = new Intent(
        Intent.ACTION_VIEW,
        Uri.parse("movierecommender://import?sharedUrl=" + Uri.encode(url))
      );
      view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(view);
    }
    finish();
  }
}
