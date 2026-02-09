// Generates the scroll-observer script to be injected into proxied pages.
// The script listens to scroll events, calculates read percentage,
// and sends debounced updates back to the parent frame via postMessage.

export function generateObserverScript(articleId: string): string {
    return `
<script data-stillread-observer>
(function() {
  var articleId = "${articleId}";
  var debounceTimer = null;
  var lastSent = 0;

  function getScrollPercent() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    var scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );
    var clientHeight = window.innerHeight || document.documentElement.clientHeight;
    var maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) return 100;
    return Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100));
  }

  function sendUpdate() {
    var pct = getScrollPercent();
    // Post to parent frame (the StillRead wrapper)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'stillread-scroll',
        articleId: articleId,
        scrollPosition: pct
      }, '*');
    }
    // Also try the API directly as a fallback
    try {
      navigator.sendBeacon(
        '/api/articles/' + articleId + '/progress',
        JSON.stringify({ scrollPosition: pct })
      );
    } catch(e) {}
    lastSent = Date.now();
  }

  window.addEventListener('scroll', function() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendUpdate, 2000);
  }, { passive: true });

  // Restore scroll position from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'stillread-restore') {
      var pct = e.data.scrollPosition || 0;
      var scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      var clientHeight = window.innerHeight || document.documentElement.clientHeight;
      var maxScroll = scrollHeight - clientHeight;
      var targetScroll = (pct / 100) * maxScroll;
      // Wait a bit for the page to fully render
      setTimeout(function() {
        window.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }, 500);
    }
  });

  // Notify parent that the observer is ready
  if (window.parent && window.parent !== window) {
    window.addEventListener('load', function() {
      window.parent.postMessage({
        type: 'stillread-ready',
        articleId: articleId
      }, '*');
    });
  }
})();
</script>`;
}
