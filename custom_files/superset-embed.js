// Default configuration, can be overridden by window.CONFIG
const DEFAULTS = {
  SUPSET_BASE_URL: 'http://localhost:8088', // Replace with your Superset instance URL
  USERNAME: 'superset',
  PASSWORD: 'superset',
  DASHBOARD_ID: '12', // User confirmed dashboard ID
};

let CONFIG = { ...DEFAULTS, ...(window.CONFIG || {}) };

let currentAccessToken = null;

// --- Logging Utility ---
function log(level, message, details = '') {
  const prefix = {
    info: 'ℹ️ [INFO]',
    success: '✅ [SUCCESS]',
    error: '❌ [ERROR]',
    warn: '⚠️ [WARN]',
    debug: '🐞 [DEBUG]',
  }[level] || '📝 [LOG]';
  console.log(`${prefix} ${message}`, details);
}

// --- Authentication ---

/**
 * Logs into Superset if no access token is available.
 * @returns {Promise<boolean>} True if login is successful or token already exists, false otherwise.
 */
async function loginSuperset() {
  if (currentAccessToken) {
    log('info', 'Access token already available.');
    return true;
  }

  log('debug', 'Attempting to login to Superset...');
  try {
    const response = await fetch(`${CONFIG.SUPSET_BASE_URL}/api/v1/security/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: CONFIG.USERNAME,
        password: CONFIG.PASSWORD,
        provider: 'db', // or 'ldap' if applicable
      }),
    });

    if (response.ok) {
      const data = await response.json();
      currentAccessToken = data.access_token;
      log('success', '🔑 Login successful. Access token obtained.');
      return true;
    }
    const errorText = await response.text();
    log('error', `Login failed. Status: ${response.status}`, errorText);
    currentAccessToken = null;
    return false;
  } catch (error) {
    log('error', 'Login request failed.', error);
    currentAccessToken = null;
    return false;
  }
}

// --- Guest Token ---

/**
 * Fetches a guest token for embedding a dashboard.
 * @returns {Promise<string|null>} The guest token, or null if fetching fails.
 */
async function getGuestTokenSuperset() {
  log('debug', 'Attempting to fetch guest token...');
  if (!currentAccessToken) {
    log('warn', 'No access token. Attempting login first...');
    const loggedIn = await loginSuperset();
    if (!loggedIn) {
      log('error', 'Cannot fetch guest token without a valid login.');
      return null;
    }
  }

  const payload = {
    user: {
      username: `embed-user-${Date.now()}`, // Unique username for guest
      first_name: 'Embed',
      last_name: 'User',
    },
    resources: [
      {
        type: 'dashboard',
        id: CONFIG.DASHBOARD_ID, // Can be dashboard ID (number) or slug (string)
      },
    ],
    rls: [], // Row Level Security rules, if any
  };

  try {
    const response = await fetch(`${CONFIG.SUPSET_BASE_URL}/api/v1/security/guest_token/`, { // Note trailing slash
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentAccessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      log('success', '🔑 Guest token obtained.', data.token.substring(0, 20) + '...');
      return data.token;
    }
    const errorText = await response.text();
    log('error', `Failed to get guest token. Status: ${response.status}`, errorText);
    return null;
  } catch (error) {
    log('error', 'Guest token request failed.', error);
    return null;
  }
}

// --- Dashboard Embedding ---

/**
 * Embeds the Superset dashboard into the specified wrapper.
 * @param {string} guestToken - The guest token for embedding.
 * @param {HTMLElement} wrapperElement - The HTML element to mount the dashboard in.
 */
async function embedDashboard(guestToken, wrapperElement) {
  if (!guestToken) {
    log('error', 'Cannot embed dashboard without a guest token.');
    return;
  }
  if (!wrapperElement) {
    log('error', 'Dashboard wrapper element not found.');
    return;
  }

  // Clear previous content
  // eslint-disable-next-line no-param-reassign
  wrapperElement.innerHTML = '';

  log('debug', 'Attempting to embed dashboard...');

  // Approach 1: Using @superset-ui/embedded-sdk (preferred)
  try {
    // Dynamically import the SDK
    const { embedDashboard: sdkEmbedDashboard } = await import('https://cdn.jsdelivr.net/npm/@superset-ui/embedded-sdk@0.1.0-alpha.10/lib/index.min.js'); // Using CDN for simplicity

    if (sdkEmbedDashboard) {
      log('info', 'Using @superset-ui/embedded-sdk to embed dashboard.');
      sdkEmbedDashboard({
        id: CONFIG.DASHBOARD_ID,
        supersetDomain: CONFIG.SUPSET_BASE_URL,
        mountPoint: wrapperElement,
        fetchGuestToken: () => Promise.resolve(guestToken),
        dashboardUiConfig: {
          // Optional: hide title, tabs, chart controls
          // hideTitle: true,
          // hideChartControls: true,
          // hideTab: true,
        },
      });
      log('success', '📊 Dashboard embedding initiated via SDK.');
      return;
    }
    log('warn', 'Superset Embedded SDK not available or failed to load. Trying fallback method.');
  } catch (sdkError) {
    log('warn', 'Failed to load or use Superset Embedded SDK. Trying fallback method.', sdkError);
  }

  // Approach 2: Manual iframe + postMessage (fallback)
  log('info', 'Using manual iframe + postMessage to embed dashboard.');
  const iframe = document.createElement('iframe');
  iframe.id = 'supersetFrame';
  // The src should be the dashboard URL without the guest token initially.
  // The guest token will be sent via postMessage.
  // Ensure standalone=1 (or similar, depending on Superset version) to minimize chrome.
  iframe.src = `${CONFIG.SUPSET_BASE_URL}/superset/dashboard/${CONFIG.DASHBOARD_ID}/?standalone=1`;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  iframe.onload = () => {
    log('debug', 'iframe loaded. Sending guestToken via postMessage.');
    try {
      const targetOrigin = new URL(CONFIG.SUPSET_BASE_URL).origin;
      iframe.contentWindow.postMessage({ type: 'guestToken', token: guestToken }, targetOrigin);
      log('success', '📊 Dashboard embedding initiated via manual iframe.');
    } catch (postMessageError) {
      log('error', 'Failed to send postMessage to iframe.', postMessageError);
    }
  };

  iframe.onerror = (error) => {
    log('error', 'Failed to load iframe content.', error);
  };

  wrapperElement.appendChild(iframe);
}

// --- Main Initialization ---

/**
 * Initializes the Superset embedding process.
 * Fetches tokens and embeds the dashboard.
 */
export async function initSupersetEmbed() {
  log('info', '🚀 Initializing Superset Embed process...');
  // Update config with any new window.CONFIG values
  CONFIG = { ...DEFAULTS, ...(window.CONFIG || {}) };

  const guestToken = await getGuestTokenSuperset(); // loginSuperset is called within if needed

  if (guestToken) {
    const dashboardWrapper = document.getElementById('dashboardWrapper');
    if (dashboardWrapper) {
      await embedDashboard(guestToken, dashboardWrapper);
    } else {
      log('error', 'Mount point #dashboardWrapper not found in the DOM.');
    }
  } else {
    log('error', 'Failed to obtain guest token. Dashboard cannot be embedded.');
  }
}

/**
 * Refreshes the embedded dashboard by fetching a new guest token.
 */
export async function refreshDashboard() {
  log('info', '🔄 Refreshing dashboard...');
  // Update config with any new window.CONFIG values
  CONFIG = { ...DEFAULTS, ...(window.CONFIG || {}) };

  // Force re-login to ensure fresh tokens if needed, or rely on existing access token
  // For a true refresh, we might want to clear currentAccessToken if it's very old.
  // currentAccessToken = null; // Uncomment to force re-login every refresh

  const guestToken = await getGuestTokenSuperset();

  if (guestToken) {
    const dashboardWrapper = document.getElementById('dashboardWrapper');
    if (dashboardWrapper) {
      await embedDashboard(guestToken, dashboardWrapper); // embedDashboard clears previous content
      log('success', 'Dashboard refresh initiated.');
    } else {
      log('error', 'Mount point #dashboardWrapper not found for refresh.');
    }
  } else {
    log('error', 'Failed to obtain new guest token for refresh.');
  }
}
