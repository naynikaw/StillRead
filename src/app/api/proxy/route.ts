import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { generateObserverScript } from '@/lib/observer';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const articleId = searchParams.get('articleId');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Fetch the remote page
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const baseUrl = new URL(targetUrl);
    const baseOrigin = baseUrl.origin;
    const $ = cheerio.load(html);

    // --- SPA Script Stripping ---
    // Sites like Substack serve fully SSR'd article HTML, but then their
    // JS bundles hydrate a React/SPA app that overwrites the content (often with
    // "Page not found" because the SPA router sees our proxy URL, not the original).
    // Solution: strip the framework/SPA bundles so the SSR content stays intact.
    const isSPA = !!(
      html.includes('substackcdn.com/bundle') ||
      html.includes('substack.com')
    );

    if (isSPA) {
      // Remove JS bundles that hydrate the SPA
      $('script[src]').each((_, el) => {
        const src = $(el).attr('src') || '';
        const isFrameworkBundle =
          src.includes('substackcdn.com/bundle') ||
          src.includes('webpack') ||
          src.includes('_next/static') ||
          src.includes('sentry');
        if (isFrameworkBundle) {
          $(el).remove();
        }
      });

      // Remove inline scripts that contain hydration/framework code
      $('script:not([src])').each((_, el) => {
        const content = $(el).html() || '';
        const isHydration =
          content.includes('__NEXT_DATA__') ||
          content.includes('__next') ||
          content.includes('hydrateRoot') ||
          content.includes('ReactDOM') ||
          content.includes('window.__preloaded') ||
          content.includes('webpackChunk');
        if (isHydration) {
          $(el).remove();
        }
      });
    }

    // Helper: resolve a relative URL to absolute
    const resolveUrl = (relative: string | undefined): string => {
      if (!relative) return '';
      if (relative.startsWith('data:') || relative.startsWith('blob:') || relative.startsWith('javascript:')) return relative;
      if (relative.startsWith('//')) return baseUrl.protocol + relative;
      if (relative.startsWith('http://') || relative.startsWith('https://')) return relative;
      try {
        return new URL(relative, targetUrl).href;
      } catch {
        return relative;
      }
    };

    // Rewrite link hrefs (stylesheets)
    $('link[href]').each((_, el) => {
      const href = $(el).attr('href');
      $(el).attr('href', resolveUrl(href));
    });

    // Rewrite script src (only for remaining scripts after SPA stripping)
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src');
      $(el).attr('src', resolveUrl(src));
    });

    // Rewrite img src and srcset
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      $(el).attr('src', resolveUrl(src));
    });
    $('img[srcset], source[srcset]').each((_, el) => {
      const srcset = $(el).attr('srcset');
      if (srcset) {
        const rewritten = srcset
          .split(',')
          .map((entry) => {
            const parts = entry.trim().split(/\s+/);
            if (parts[0]) parts[0] = resolveUrl(parts[0]);
            return parts.join(' ');
          })
          .join(', ');
        $(el).attr('srcset', rewritten);
      }
    });

    // Rewrite source src
    $('source[src]').each((_, el) => {
      const src = $(el).attr('src');
      $(el).attr('src', resolveUrl(src));
    });

    // Rewrite video and audio src
    $('video[src], audio[src]').each((_, el) => {
      const src = $(el).attr('src');
      $(el).attr('src', resolveUrl(src));
    });

    // Rewrite video poster
    $('video[poster]').each((_, el) => {
      const poster = $(el).attr('poster');
      $(el).attr('poster', resolveUrl(poster));
    });

    // Rewrite anchor hrefs to keep navigation inside proxy
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        $(el).attr('href', resolveUrl(href));
        $(el).attr('target', '_blank');
        $(el).attr('rel', 'noopener noreferrer');
      }
    });

    // Rewrite background images in inline styles
    $('[style]').each((_, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\(['"]?((?!data:)[^'")\s]+)['"]?\)/gi, (match, url) => {
        return `url('${resolveUrl(url)}')`;
      });
      $(el).attr('style', style);
    });

    // Rewrite url() and @import in <style> blocks
    $('style').each((_, el) => {
      let css = $(el).html() || '';
      // Rewrite url() references
      css = css.replace(/url\(['"]?((?!data:)[^'")\s]+)['"]?\)/gi, (match, url) => {
        return `url('${resolveUrl(url)}')`;
      });
      // Rewrite @import url or bare @import
      css = css.replace(/@import\s+['"]([^'"]+)['"]/gi, (match, url) => {
        return `@import '${resolveUrl(url)}'`;
      });
      $(el).html(css);
    });

    // NOTE: We intentionally do NOT add a <base> tag here.
    // All URLs are already rewritten to absolute, and a <base> tag
    // would interfere with the fetch/XHR interceptor's relative paths.

    // Inject our scroll observer script
    if (articleId) {
      $('head').append(generateObserverScript(articleId));
    }

    // Inject fetch/XHR interceptor BEFORE all other scripts so SPA API calls go through our proxy
    const interceptorScript = `
      <script data-stillread-interceptor>
      (function() {
        var ORIGIN = "${baseOrigin}";
        var REAL_ORIGIN = window.location.origin;  // Save before we spoof window.location
        var PROXY_PASS = REAL_ORIGIN + "/api/proxy/pass?url=";

        // Resolve a URL relative to the original page origin
        function resolveToOrigin(url) {
          if (!url || typeof url !== 'string') return url;
          // Already going through our proxy
          if (url.indexOf('/api/proxy') === 0 || url.indexOf(REAL_ORIGIN + '/api/proxy') === 0) return url;
          // Data/blob URLs — leave alone
          if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url;
          // Absolute URL to the original origin — proxy it
          if (url.indexOf(ORIGIN) === 0) {
            return PROXY_PASS + encodeURIComponent(url);
          }
          // Absolute URL to a different origin — proxy it too (cross-origin API calls)
          if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
            return PROXY_PASS + encodeURIComponent(url);
          }
          // Protocol-relative
          if (url.indexOf('//') === 0) {
            return PROXY_PASS + encodeURIComponent('https:' + url);
          }
          // Relative URL — resolve against original origin
          try {
            var absolute = new URL(url, ORIGIN).href;
            return PROXY_PASS + encodeURIComponent(absolute);
          } catch(e) {
            return url;
          }
        }

        // --- Monkey-patch fetch ---
        var originalFetch = window.fetch;
        window.fetch = function(input, init) {
          try {
            var url;
            if (input instanceof Request) {
              url = input.url;
              var proxiedUrl = resolveToOrigin(url);
              if (proxiedUrl !== url) {
                input = new Request(proxiedUrl, {
                  method: input.method,
                  headers: input.headers,
                  body: input.method !== 'GET' && input.method !== 'HEAD' ? input.body : undefined,
                  mode: 'cors',
                  credentials: 'omit',
                  redirect: input.redirect
                });
              }
            } else if (typeof input === 'string') {
              input = resolveToOrigin(input);
            }
          } catch(e) {
            console.warn('[StillRead] fetch intercept error:', e);
          }
          return originalFetch.call(this, input, init);
        };

        // --- Monkey-patch XMLHttpRequest ---
        var originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async_, user, password) {
          try {
            if (typeof url === 'string') {
              url = resolveToOrigin(url);
            }
          } catch(e) {
            console.warn('[StillRead] XHR intercept error:', e);
          }
          return originalXHROpen.call(this, method, url, async_ !== undefined ? async_ : true, user, password);
        };

        // --- Spoof window.location for SPA routers ---
        // SPA routers check location.pathname to decide which page/route to render.
        // We need them to see the original article URL, not /api/proxy?url=...
        try {
          var targetUrl = new URL("${targetUrl}");
          var spoofedLocation = {
            href: targetUrl.href,
            protocol: targetUrl.protocol,
            host: targetUrl.host,
            hostname: targetUrl.hostname,
            port: targetUrl.port,
            pathname: targetUrl.pathname,
            search: targetUrl.search,
            hash: targetUrl.hash || window.location.hash,
            origin: targetUrl.origin,
            ancestorOrigins: window.location.ancestorOrigins,
            toString: function() { return targetUrl.href; },
            assign: function(url) { window.location.assign(url); },
            replace: function(url) { window.location.replace(url); },
            reload: function() { window.location.reload(); }
          };
          Object.defineProperty(window, 'location', {
            get: function() { return spoofedLocation; },
            configurable: true
          });
        } catch(e) {
          console.warn('[StillRead] location spoof error:', e);
        }

        // --- Intercept history.pushState / replaceState ---
        // Prevent SPA from changing the URL bar
        var origPushState = history.pushState;
        var origReplaceState = history.replaceState;
        history.pushState = function(state, title, url) {
          // Silently absorb — don't let SPA change the URL
          return;
        };
        history.replaceState = function(state, title, url) {
          return;
        };

        // --- Prevent frame-busting ---
        if (window.top !== window.self) {
          try {
            Object.defineProperty(window, 'top', { get: function() { return window.self; } });
          } catch(e) {}
        }
      })();
      </script>
      <style data-stillread-overrides>
        html { scroll-behavior: smooth; }
      </style>`;

    // Insert interceptor as the FIRST thing in <head> so it patches fetch/XHR before any scripts run
    $('head').prepend(interceptorScript);

    const finalHtml = $.html();

    return new NextResponse(finalHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *;",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
