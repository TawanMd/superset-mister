// superset-diagnostics.js

const DEFAULT_CONFIG = {
  SUPSET_BASE_URL: 'http://localhost:8088',
  USERNAME: 'superset',
  PASSWORD: 'superset',
  DASHBOARD_ID: 12, // Can be number or slug
  GUEST_USER: { username: 'embed-bot-diag', first_name: 'Embed', last_name: 'Bot' },
  DIAG_TIMEOUT_MS: 10000,
  SDK_CDN_URL: 'https://cdn.jsdelivr.net/npm/@superset-ui/embedded-sdk@0.1.0-alpha.10/lib/index.min.js',
  // SDK_CDN_URL: 'https://cdn.jsdelivr.net/npm/@superset-ui/embedded-sdk/lib/index.umd.min.js', // Alternative UMD build
};

let CONFIG = { ...DEFAULT_CONFIG, ...(window.CONFIG || {}) };
let currentAccessToken = null; // Store access token for reuse

// --- Logging Utility ---
const LOG_COLORS = {
  info: 'blue',
  success: 'green',
  error: 'red',
  warn: 'orange',
  debug: 'purple',
};

function log(level, message, ...details) {
  const color = LOG_COLORS[level] || 'black';
  const prefix = {
    info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️', debug: '🐞',
  }[level] || '📝';
  console.log(`%c${prefix} [${level.toUpperCase()}] ${message}`, `color: ${color}; font-weight: bold;`, ...details);
}

// --- Helper: Fetch with Timeout ---
async function fetchWithTimeout(resource, options = {}, timeout = CONFIG.DIAG_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout / 1000}s`);
    }
    throw error;
  }
}

// --- Helper: Superset Login ---
async function loginToSuperset() {
  if (currentAccessToken) {
    log('debug', 'Using existing access token for diagnostics.');
    return true;
  }
  log('debug', `Attempting login to Superset (${CONFIG.USERNAME})...`);
  try {
    const response = await fetchWithTimeout(`${CONFIG.SUPSET_BASE_URL}/api/v1/security/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: CONFIG.USERNAME,
        password: CONFIG.PASSWORD,
        provider: 'db',
      }),
    });
    if (response.ok) {
      const data = await response.json();
      currentAccessToken = data.access_token;
      log('success', 'Login successful for diagnostics.');
      return true;
    }
    const errorText = await response.text();
    log('error', `Superset login failed for diagnostics. Status: ${response.status}`, errorText);
    currentAccessToken = null;
    return false;
  } catch (error) {
    log('error', 'Superset login request failed for diagnostics.', error.message);
    currentAccessToken = null;
    return false;
  }
}


// --- Check Functions ---

// 1. Reachability
async function checkReachability() {
  const checkName = 'Superset Reachability';
  log('info', `Running check: ${checkName}`);
  try {
    const response = await fetchWithTimeout(`${CONFIG.SUPSET_BASE_URL}/health`);
    if (response.ok) {
      const text = await response.text();
      if (text.trim().toLowerCase() === 'ok') {
        return { checkName, status: '✅', details: `Successfully reached ${CONFIG.SUPSET_BASE_URL}/health. Status: ${response.status}. Response: "OK"`, suggestion: '' };
      }
      return { checkName, status: '⚠️', details: `Reached ${CONFIG.SUPSET_BASE_URL}/health, but response was not "OK". Status: ${response.status}. Response: ${text.substring(0,100)}`, suggestion: 'Ensure Superset backend is healthy and /health endpoint is standard.' };
    }
    return { checkName, status: '❌', details: `Failed to reach ${CONFIG.SUPSET_BASE_URL}/health. Status: ${response.status}`, suggestion: 'Verify Superset URL, ensure backend is running, and check network connectivity.' };
  } catch (error) {
    return { checkName, status: '❌', details: `Error reaching ${CONFIG.SUPSET_BASE_URL}/health: ${error.message}`, suggestion: 'Verify Superset URL, ensure backend is running, check for firewall/proxy issues, and DNS resolution.' };
  }
}

// 2. CORS Headers
async function checkCorsHeaders() {
  const checkName = 'CORS Headers';
  log('info', `Running check: ${checkName}`);
  try {
    const response = await fetchWithTimeout(`${CONFIG.SUPSET_BASE_URL}/health`); // Can reuse /health or other simple GET
    const acaoHeader = response.headers.get('Access-Control-Allow-Origin');
    const currentOrigin = window.location.origin;
    if (acaoHeader === '*' || acaoHeader === currentOrigin) {
      return { checkName, status: '✅', details: `Access-Control-Allow-Origin: "${acaoHeader}". Correctly allows this origin (${currentOrigin}).`, suggestion: '' };
    }
    if (acaoHeader) {
      return { checkName, status: '❌', details: `Access-Control-Allow-Origin: "${acaoHeader}". Does NOT allow this origin (${currentOrigin}).`, suggestion: `In superset_config.py, ensure ENABLE_CORS = True and CORS_OPTIONS includes '${currentOrigin}' in 'origins'.` };
    }
    return { checkName, status: '❌', details: 'Access-Control-Allow-Origin header is MISSING.', suggestion: `In superset_config.py, set ENABLE_CORS = True and configure CORS_OPTIONS to include this origin ('${currentOrigin}') in the 'origins' list.` };
  } catch (error) {
    return { checkName, status: '❌', details: `Error checking CORS headers (could not fetch /health): ${error.message}`, suggestion: 'Resolve reachability issues first. This check depends on a successful GET request to Superset.' };
  }
}

// 3. X-Frame-Options
async function checkXFrameOptions() {
  const checkName = 'X-Frame-Options Header';
  log('info', `Running check: ${checkName}`);
  const dashboardUrl = `${CONFIG.SUPSET_BASE_URL}/superset/dashboard/${CONFIG.DASHBOARD_ID}/?standalone=1`;
  try {
    const response = await fetchWithTimeout(dashboardUrl); // Fetching dashboard URL as /health might not have XFO
    const xfoHeader = response.headers.get('X-Frame-Options');
    if (!xfoHeader) {
      return { checkName, status: '✅', details: 'X-Frame-Options header is ABSENT (good for embedding).', suggestion: '' };
    }
    const xfoUpper = xfoHeader.toUpperCase();
    if (xfoUpper === 'DENY' || xfoUpper === 'SAMEORIGIN') {
      return { checkName, status: '❌', details: `X-Frame-Options: "${xfoHeader}". This PREVENTS embedding from different origins.`, suggestion: 'If Flask-Talisman is enabled, try setting `TALISMAN_ENABLED = False` in `superset_config.py`. Alternatively, configure Talisman with `{"frame_options": "ALLOW-FROM", "frame_options_allow_from": "your-domain.com"}` or ensure `EMBEDDED_SUPERSET = True` correctly modifies headers. If not using Talisman, try setting `HTTP_HEADERS = {"X-Frame-Options": null}` or use CSP frame-ancestors (see next check).' };
    }
    // ALLOW-FROM is deprecated but if present and correct, it's a pass.
    if (xfoUpper.startsWith('ALLOW-FROM') && xfoUpper.includes(window.location.origin)) {
         return { checkName, status: '✅', details: `X-Frame-Options: "${xfoHeader}". Allows this origin (though ALLOW-FROM is deprecated).`, suggestion: 'Consider migrating to Content-Security-Policy frame-ancestors for better compatibility.' };
    }
    return { checkName, status: '⚠️', details: `X-Frame-Options: "${xfoHeader}". Unusual value. Embedding might be affected.`, suggestion: 'Ideally, this header should be absent or managed by Content-Security-Policy frame-ancestors for embedded content.' };
  } catch (error) {
    return { checkName, status: '❌', details: `Error checking X-Frame-Options (could not fetch dashboard URL): ${error.message}`, suggestion: 'Resolve dashboard reachability. This check depends on fetching the dashboard page. Ensure dashboard ID is correct.' };
  }
}

// 4. CSP frame-ancestors
async function checkCspFrameAncestors() {
  const checkName = 'CSP frame-ancestors';
  log('info', `Running check: ${checkName}`);
  const dashboardUrl = `${CONFIG.SUPSET_BASE_URL}/superset/dashboard/${CONFIG.DASHBOARD_ID}/?standalone=1`;
  try {
    const response = await fetchWithTimeout(dashboardUrl);
    const cspHeader = response.headers.get('Content-Security-Policy');
    if (!cspHeader) {
      return { checkName, status: '⚠️', details: 'Content-Security-Policy header is MISSING.', suggestion: 'If X-Frame-Options is also restrictive (check #3), embedding will fail. Consider adding CSP with frame-ancestors. If Talisman is enabled and causing XFO issues, setting `TALISMAN_ENABLED = False` might be needed. Suggested `superset_config.py` entry for CSP:\n```python\nHTTP_HEADERS = {\n    "Content-Security-Policy": "frame-ancestors \'self\' ' + window.location.origin + ';"\n}\nTALISMAN_ENABLED = False # If Talisman is overriding X-Frame-Options\n```' };
    }
    const frameAncestorsMatch = cspHeader.match(/frame-ancestors\s+([^;]+)/i);
    if (!frameAncestorsMatch) {
      return { checkName, status: '⚠️', details: `Content-Security-Policy: "${cspHeader.substring(0,100)}...". Directive 'frame-ancestors' is MISSING.`, suggestion: 'If X-Frame-Options is restrictive (check #3), embedding will fail. Add frame-ancestors to CSP. If Talisman is enabled and causing XFO issues, setting `TALISMAN_ENABLED = False` might be needed. Suggested `superset_config.py` entry for CSP:\n```python\nHTTP_HEADERS = {\n    "Content-Security-Policy": "frame-ancestors \'self\' ' + window.location.origin + '; YOUR_EXISTING_CSP_IF_ANY"\n}\nTALISMAN_ENABLED = False # If Talisman is overriding X-Frame-Options\n```' };
    }
    const sources = frameAncestorsMatch[1].toLowerCase();
    const currentOrigin = window.location.origin.toLowerCase();
    if (sources.includes("'none'")) {
        return { checkName, status: '❌', details: `CSP frame-ancestors: "${frameAncestorsMatch[1]}". Contains 'none', PREVENTING embedding.`, suggestion: 'Remove \'none\' from frame-ancestors and add this origin. Suggested `superset_config.py` entry:\n```python\nHTTP_HEADERS = {\n    "Content-Security-Policy": "frame-ancestors \'self\' ' + currentOrigin + '; YOUR_EXISTING_CSP_IF_ANY"\n}\nTALISMAN_ENABLED = False # If Talisman is overriding X-Frame-Options\n```' };
    }
    if (sources.includes(currentOrigin) || sources.includes('*') || (sources.includes("'self'") && CONFIG.SUPSET_BASE_URL.startsWith(currentOrigin))) { // crude check for 'self'
      return { checkName, status: '✅', details: `CSP frame-ancestors: "${frameAncestorsMatch[1]}". Allows this origin.`, suggestion: '' };
    }
    return { checkName, status: '❌', details: `CSP frame-ancestors: "${frameAncestorsMatch[1]}". Does NOT allow this origin (${currentOrigin}).`, suggestion: 'Add this origin to frame-ancestors. Suggested `superset_config.py` entry:\n```python\nHTTP_HEADERS = {\n    "Content-Security-Policy": "frame-ancestors \'self\' ' + currentOrigin + '; ' + frameAncestorsMatch[1] + '"\n}\nTALISMAN_ENABLED = False # If Talisman is overriding X-Frame-Options\n```' };
  } catch (error) {
    return { checkName, status: '❌', details: `Error checking CSP (could not fetch dashboard URL): ${error.message}`, suggestion: 'Resolve dashboard reachability. This check depends on fetching the dashboard page.' };
  }
}

// 5. Guest-Token API
async function checkGuestTokenApi() {
  const checkName = 'Guest-Token API';
  log('info', `Running check: ${checkName}`);
  if (!await loginToSuperset()) {
    return { checkName, status: '❌', details: 'Login failed, cannot test Guest-Token API.', suggestion: 'Fix Superset login (URL, credentials, CORS for login endpoint).' };
  }
  try {
    const payload = {
      user: CONFIG.GUEST_USER,
      resources: [{ type: 'dashboard', id: String(CONFIG.DASHBOARD_ID) }], // ID must be string for some Superset versions
      rls: [],
    };
    const response = await fetchWithTimeout(`${CONFIG.SUPSET_BASE_URL}/api/v1/security/guest_token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentAccessToken}`,
        // No X-CSRF-Token for this diagnostic, assuming it's exempted or handled by Superset for guest tokens
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        return { checkName, status: '✅', details: `Guest-Token API call successful (Status ${response.status}). Token received.`, suggestion: '' };
      }
      return { checkName, status: '⚠️', details: `Guest-Token API call returned ${response.status}, but no token in response.`, suggestion: 'Check Superset logs for guest token generation errors.' };
    }
    const errorText = await response.text();
     let suggestion = 'Ensure Superset is configured for guest tokens (e.g., `GUEST_TOKEN_JWT_SECRET` in config), user has permissions, dashboard ID is valid. Check Superset logs.';
    if (errorText.includes("CSRF token is missing")) {
        suggestion = 'The /api/v1/security/guest_token/ endpoint requires a CSRF token. Either implement CSRF token fetching in your embed solution or exempt this route from CSRF protection in Superset (e.g., via `@csrf.exempt` in `superset/security/api.py`).';
    }
    return { checkName, status: '❌', details: `Guest-Token API call failed. Status: ${response.status}. Error: ${errorText.substring(0,200)}`, suggestion };
  } catch (error) {
    return { checkName, status: '❌', details: `Error calling Guest-Token API: ${error.message}`, suggestion: 'Check network, Superset logs, and ensure the API path is correct.' };
  }
}

// 6. Embed SDK
async function checkEmbedSdk() {
  const checkName = 'Superset Embedded SDK';
  log('info', `Running check: ${checkName}`);
  try {
    const sdk = await import(CONFIG.SDK_CDN_URL);
    if (sdk && sdk.embedDashboard) {
      // Try a minimal instantiation if possible, or just check for function existence
      // const div = document.createElement('div'); // dummy div
      // await sdk.embedDashboard({ id: CONFIG.DASHBOARD_ID, supersetDomain: CONFIG.SUPSET_BASE_URL, mountPoint: div, fetchGuestToken: async () => "fake-token" });
      return { checkName, status: '✅', details: `Successfully imported 'embedDashboard' function from SDK (${CONFIG.SDK_CDN_URL}).`, suggestion: '' };
    }
    return { checkName, status: '❌', details: `'embedDashboard' function not found in SDK module from ${CONFIG.SDK_CDN_URL}.`, suggestion: 'Verify SDK CDN URL or try a different build (e.g., UMD version).' };
  } catch (error) {
    let suggestion = `Failed to import or use SDK from ${CONFIG.SDK_CDN_URL}. Error: ${error.message}. Check browser console for more details.`;
    if (error.message.includes('exports is not defined')) {
      suggestion = `SDK import failed with "exports is not defined". The SDK script from ${CONFIG.SDK_CDN_URL} might be in CommonJS format. Try using a UMD build of the SDK if available, or integrate Superset embedding using a build tool (Webpack, Vite, Parcel) that handles different module formats. If using <script type="module">, ensure the CDN serves an ES Module.`;
    }
    return { checkName, status: '❌', details: `Failed to load or use Embedded SDK. Error: ${error.message.substring(0,100)}`, suggestion };
  }
}

// 7. Manual iframe
async function checkManualIframe() {
  const checkName = 'Manual Iframe Embedding';
  log('info', `Running check: ${checkName}`);
  
  // This check relies on a guest token.
  if (!currentAccessToken && !await loginToSuperset()) {
     return { checkName, status: '⚠️', details: 'Skipped: Login failed, cannot obtain guest token for iframe test.', suggestion: 'Fix login issues first.' };
  }
  let guestToken = null;
  try {
    const payload = { user: CONFIG.GUEST_USER, resources: [{ type: 'dashboard', id: String(CONFIG.DASHBOARD_ID) }], rls: [] };
    const tokenResponse = await fetchWithTimeout(`${CONFIG.SUPSET_BASE_URL}/api/v1/security/guest_token/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}`},
      body: JSON.stringify(payload),
    });
    if (!tokenResponse.ok) throw new Error(`Guest token fetch failed: ${tokenResponse.status}`);
    const tokenData = await tokenResponse.json();
    guestToken = tokenData.token;
    if (!guestToken) throw new Error('No guest token returned from API.');
  } catch(e) {
    return { checkName, status: '⚠️', details: `Skipped: Failed to get guest token for iframe test: ${e.message}`, suggestion: 'Fix Guest-Token API issues first.' };
  }

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none'; // Don't show it
    const dashboardUrl = `${CONFIG.SUPSET_BASE_URL}/superset/dashboard/${CONFIG.DASHBOARD_ID}/?standalone=1`; // No token in URL for postMessage approach
    iframe.src = dashboardUrl;
    document.body.appendChild(iframe);

    let resolved = false;
    const testTimeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      iframe.remove();
      resolve({ checkName, status: '❌', details: 'Iframe loading or postMessage timed out.', suggestion: 'Check X-Frame-Options/CSP. If those are fine, inspect iframe content manually. Ensure dashboard ID is correct and dashboard is published.' });
    }, CONFIG.DIAG_TIMEOUT_MS / 2); // Shorter timeout for iframe part

    iframe.onload = () => {
      if (resolved) return;
      log('debug', 'Manual iframe onload triggered.');
      try {
        // Test postMessage with '*' as targetOrigin
        iframe.contentWindow.postMessage({ type: 'guestToken', token: guestToken }, '*');
        // A more robust check would be to listen for a response from the iframe, but that's complex for a diagnostic.
        // For now, if postMessage doesn't throw an error and XFO/CSP passed, we assume it's mostly working.
        // The "recipient window's origin ('null')" error happens if XFO/CSP blocked content.
        // If iframe.contentWindow.origin is 'null' here, it means XFO/CSP blocked it.
        if (iframe.contentWindow && iframe.contentWindow.origin && iframe.contentWindow.origin !== 'null') {
            clearTimeout(testTimeout);
            resolved = true;
            iframe.remove();
            resolve({ checkName, status: '✅', details: 'Iframe loaded and postMessage sent successfully (using targetOrigin "*").', suggestion: 'For production, use a specific targetOrigin in postMessage instead of "*".' });
        } else {
            // This case might be hit if XFO/CSP is blocking, leading to origin 'null'
            clearTimeout(testTimeout);
            resolved = true;
            iframe.remove();
            resolve({ checkName, status: '❌', details: `Iframe loaded, but its contentWindow.origin is '${iframe.contentWindow ? iframe.contentWindow.origin : "N/A"}'. This usually means X-Frame-Options or CSP blocked the content. postMessage would fail.`, suggestion: 'Fix X-Frame-Options/CSP issues (Checks #3 and #4).' });
        }
      } catch (e) {
        if (resolved) return;
        clearTimeout(testTimeout);
        resolved = true;
        iframe.remove();
        resolve({ checkName, status: '❌', details: `Iframe loaded, but postMessage failed: ${e.message}`, suggestion: 'This might be due to X-Frame-Options/CSP blocking, or other iframe security issues. Check browser console for more specific errors related to the iframe.' });
      }
    };
    iframe.onerror = () => {
      if (resolved) return;
      clearTimeout(testTimeout);
      resolved = true;
      iframe.remove();
      resolve({ checkName, status: '❌', details: 'Iframe failed to load (onerror triggered).', suggestion: 'Check dashboard URL, network issues, or X-Frame-Options/CSP blocking (see browser console for specific iframe errors).' });
    };
  });
}


// 8. Port Reachability (WebSocket Ping)
async function checkPortReachability() {
  const checkName = 'Superset Port Reachability (WebSocket)';
  log('info', `Running check: ${checkName}`);
  
  return new Promise((resolve) => {
    let urlParts;
    try {
      urlParts = new URL(CONFIG.SUPSET_BASE_URL);
    } catch (e) {
      resolve({ checkName, status: '❌', details: `Invalid SUPSET_BASE_URL: ${CONFIG.SUPSET_BASE_URL}. Error: ${e.message}`, suggestion: 'Fix SUPSET_BASE_URL in config.' });
      return;
    }

    const wsProtocol = urlParts.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${urlParts.hostname}:${urlParts.port || (wsProtocol === 'wss:' ? 443 : 80)}`;
    
    log('debug', `Attempting WebSocket connection to ${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      socket.close();
      resolve({ checkName, status: '❌', details: `WebSocket connection to ${wsUrl} timed out. Port might be closed or firewalled.`, suggestion: 'Ensure Superset port is open and accessible. Check firewalls or if Superset is bound to localhost only.' });
    }, CONFIG.DIAG_TIMEOUT_MS / 2); // Shorter timeout for WebSocket

    socket.onopen = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      socket.close();
      resolve({ checkName, status: '✅', details: `Successfully connected to ${wsUrl} via WebSocket. Port is open.`, suggestion: '' });
    };

    socket.onerror = (event) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      log('error', 'WebSocket onerror event:', event);
      resolve({ checkName, status: '❌', details: `WebSocket connection to ${wsUrl} failed. Port might be closed, firewalled, or Superset not running/accepting connections.`, suggestion: 'Ensure Superset is running on the correct port, port is open, and no firewall is blocking. If using HTTPS, ensure SSL certificate is valid.' });
    };
  });
}


// --- Main Diagnostic Runner ---
export async function runDiagnostics() {
  log('info', '🚀 Starting Superset Embedding Diagnostics...');
  // Reset global config from window if available
  CONFIG = { ...DEFAULT_CONFIG, ...(window.CONFIG || {}) };
  currentAccessToken = null; // Reset token for fresh diagnostics

  const results = [];
  
  results.push(await checkReachability());
  results.push(await checkCorsHeaders());
  // For XFO and CSP, it's better to fetch the dashboard URL as /health might not have these headers.
  // This implies a dependency on the dashboard ID being correct.
  results.push(await checkXFrameOptions());
  results.push(await checkCspFrameAncestors());
  results.push(await checkGuestTokenApi());
  results.push(await checkEmbedSdk());
  results.push(await checkManualIframe());
  
  // Only run port check if some of the initial HTTP checks failed badly
  const criticalFailures = results.slice(0, 5).filter(r => r.status === '❌').length;
  if (criticalFailures > 1) { // Heuristic: if multiple basic things fail, check port
      log('warn', 'Multiple critical checks failed, running port reachability test as a fallback.');
      results.push(await checkPortReachability());
  } else {
      results.push({checkName: 'Superset Port Reachability (WebSocket)', status: '⚠️', details: 'Skipped. Basic HTTP checks were mostly successful or did not indicate a port-level issue.', suggestion: 'Run if other checks fail unexpectedly.'});
  }

  log('info', '🏁 Superset Embedding Diagnostics Finished.');
  return results;
}
