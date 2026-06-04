let currentStep = 1;
let modelsData = null; // Store fetched models data

// Supabase endpoint — MUST stay in sync with list-modal.js.
const SUPABASE_URL = 'https://supabase.generationai.cloud';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNDM0NDM2LCJleHAiOjE5MzgxMTQ0MzZ9.nTULGxKu8CDVjpmS9-6Efc3zoUlKOhfrwOTHurKmDxo';

async function ensureSyncConfig() {
  try {
    await chrome.runtime.sendMessage({ action: 'setSyncConfig', url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  } catch (e) { /* background may be cold; sign-in will surface a real error */ }
}

function setAccountStatus(text, kind) {
  const el = document.getElementById('account-sync-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('active', !!text);
  el.style.color = kind === 'error' ? '#c0392b' : '#4a90e2';
}

// The Spaces step is the 6th wizard step. It uses id="step-spaces" rather than
// "step-6" so the numeric step-${n} convention below stays intact; stepElementId()
// maps the current index to the right element id.
function stepElementId(n) {
  return n === 6 ? 'step-spaces' : `step-${n}`;
}

function nextStep() {
  if (currentStep < 6) {
    document.getElementById(stepElementId(currentStep)).classList.remove('active');
    currentStep++;
    document.getElementById(stepElementId(currentStep)).classList.add('active');
    updateStepIndicator();
  }
}

function prevStep() {
  if (currentStep > 1) {
    document.getElementById(stepElementId(currentStep)).classList.remove('active');
    currentStep--;
    document.getElementById(stepElementId(currentStep)).classList.add('active');
    updateStepIndicator();
  }
}

function updateStepIndicator() {
  document.querySelectorAll('.step-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx + 1 <= currentStep);
  });
}

/**
 * Test gateway connection and fetch models (called when going from Step 4 to Step 5)
 */
async function testAndFetchModels() {
  const apiKey = document.getElementById('gateway-api-key').value.trim();

  if (!apiKey) {
    alert('Please enter your LLM Gateway API key.');
    return false;
  }

  // Show loading message
  const loadingMessage = document.getElementById('loading-message');
  loadingMessage.classList.add('active');

  try {
    // Call background service worker to test connection and fetch models
    const response = await chrome.runtime.sendMessage({
      action: 'testGatewayConnection',
      apiKey: apiKey
    });

    if (!response.success) {
      alert(`Connection failed: ${response.message}\n\nPlease check your API key and try again.`);
      loadingMessage.classList.remove('active');
      return false;
    }

    // Store models data globally
    modelsData = response.modelsData;

    // Populate provider dropdowns
    populateProviderDropdowns();

    loadingMessage.classList.remove('active');
    return true;

  } catch (error) {
    alert(`Error testing connection: ${error.message}`);
    loadingMessage.classList.remove('active');
    return false;
  }
}

/**
 * Populate provider dropdowns with models from gateway
 */
function populateProviderDropdowns() {
  if (!modelsData) {
    console.error('No models data available');
    return;
  }

  const providers = Object.keys(modelsData);
  const providerDropdowns = [
    document.getElementById('youtube-provider'),
    document.getElementById('transcript-provider'),
    document.getElementById('page-provider')
  ];

  // Populate each provider dropdown
  providerDropdowns.forEach(dropdown => {
    dropdown.innerHTML = '';
    providers.forEach(provider => {
      const option = document.createElement('option');
      option.value = provider;
      option.textContent = getProviderDisplayName(provider);
      dropdown.appendChild(option);
    });

    // Default to groq if available
    if (providers.includes('groq')) {
      dropdown.value = 'groq';
    }
  });

  // Update model dropdowns based on default provider
  updateModelDropdown('youtube-model', document.getElementById('youtube-provider').value);
  updateModelDropdown('transcript-model', document.getElementById('transcript-provider').value);
  updateModelDropdown('page-model', document.getElementById('page-provider').value);
}

/**
 * Update model dropdown based on selected provider
 */
function updateModelDropdown(dropdownId, provider) {
  const dropdown = document.getElementById(dropdownId);
  dropdown.innerHTML = '';

  if (!modelsData || !modelsData[provider]) {
    dropdown.innerHTML = '<option value="">No models available</option>';
    return;
  }

  const models = modelsData[provider].models || [];
  models.forEach(modelObj => {
    const option = document.createElement('option');
    option.value = modelObj.id;
    option.textContent = modelObj.id;
    dropdown.appendChild(option);
  });

  // Select first model by default
  if (models.length > 0) {
    dropdown.value = models[0].id;
  }
}

/**
 * Get display name for provider
 */
function getProviderDisplayName(provider) {
  const names = {
    groq: 'Groq (Fast Inference)',
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI',
    google: 'Google AI (Gemini)',
    deepseek: 'Deepseek',
    perplexity: 'Perplexity',
    xai: 'xAI (Grok)',
    sambanova: 'SambaNova',
    moonshot: 'Moonshot',
    qwen: 'Alibaba/Qwen',
    alibaba: 'Alibaba/Qwen',
    cohere: 'Cohere',
    mistral: 'Mistral',
    cerebras: 'Cerebras',
    together: 'Together AI',
    featherai: 'Feather AI',
    openrouter: 'OpenRouter'
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

function showWizardFromGate() {
  document.getElementById('account-gate').style.display = 'none';
  document.getElementById('wizard').style.display = '';
}

function showLoginPanel() {
  document.getElementById('account-choice').style.display = 'none';
  document.getElementById('account-login').style.display = '';
}

function showAccountChoice() {
  document.getElementById('account-login').style.display = 'none';
  document.getElementById('account-choice').style.display = '';
  setAccountStatus('', null);
}

async function handleGateSignIn() {
  const email = document.getElementById('account-email').value.trim();
  const password = document.getElementById('account-password').value;
  if (!email || !password) { setAccountStatus('Enter email and password.', 'error'); return; }

  const signinBtn = document.getElementById('account-signin-btn');
  signinBtn.disabled = true;
  try {
    setAccountStatus('Signing in…', 'info');
    await ensureSyncConfig();
    const res = await chrome.runtime.sendMessage({ action: 'authSignIn', email, password });
    if (!res || !res.success) throw new Error((res && res.error) || 'Sign-in failed');

    setAccountStatus('Downloading your data…', 'info');
    // NOTE: syncCycle() swallows its own internal errors, so syncNow returns
    // { success: true } even if a pull failed — this check only catches a
    // dropped message or a future throwing handler. Eventual consistency comes
    // from the background refresh alarm + the list page storage live-refresh.
    const syncRes = await chrome.runtime.sendMessage({ action: 'syncNow' });
    if (!syncRes || !syncRes.success) throw new Error((syncRes && syncRes.error) || 'Sync failed');

    // Run the per-install Spaces step AFTER the sync round-trip so any synced-down
    // Spaces are visible. This always writes rvLocal regardless of the synced
    // onboardingComplete flag (it doubles as the per-install setup gate).
    const stored = await chrome.storage.local.get('rvData');
    const rvData = stored.rvData || { bookmarks: [], categories: [], settings: {}, spaces: [] };
    rvData.spaces = rvData.spaces || [];
    await runGateSpacesStep(rvData); // resolves only once >=1 enabled Space + a default are set

    rvData.settings = rvData.settings || {};
    rvData.settings.onboardingComplete = true;
    await chrome.storage.local.set({ rvData });

    setAccountStatus('Done ✓', 'info');
    window.location.href = 'list-modal.html';
  } catch (e) {
    setAccountStatus(`❌ ${e.message}`, 'error');
    signinBtn.disabled = false;
  }
}

async function runGateSpacesStep(rvData) {
  const step = document.getElementById('gate-spaces-step');
  const existing = document.getElementById('gate-spaces-existing');
  step.style.display = 'block';

  const liveSpaces = () => (rvData.spaces || []).filter(s => !s.deletedAt)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  function render() {
    const live = liveSpaces();
    existing.innerHTML = live.map((s, i) => `
      <div>
        <label><input type="checkbox" class="gate-sp-enabled" data-id="${s.id}" ${i === 0 ? 'checked' : ''}> ${s.name}</label>
        <label><input type="radio" name="gate-sp-default" class="gate-sp-default" data-id="${s.id}" ${i === 0 ? 'checked' : ''}> default</label>
      </div>`).join('') || '<p>No Spaces yet — create one below.</p>';
  }
  render();

  document.getElementById('gate-add-space-btn').onclick = async () => {
    const inp = document.getElementById('gate-new-space-name');
    const name = inp.value.trim(); if (!name) return;
    const now = new Date().toISOString();
    const maxP = (rvData.spaces || []).reduce((m, s) => Math.max(m, s.priority || 0), 0);
    rvData.spaces.push({ id: crypto.randomUUID(), name, priority: maxP + 1, updatedAt: now, _dirty: true });
    await chrome.storage.local.set({ rvData });
    inp.value = '';
    render();
  };

  await new Promise((resolve) => {
    document.getElementById('gate-spaces-continue').onclick = async () => {
      const enabled = Array.from(document.querySelectorAll('.gate-sp-enabled')).filter(c => c.checked).map(c => c.dataset.id);
      let def = (document.querySelector('.gate-sp-default:checked') || {}).dataset?.id || enabled[0];
      if (def && !enabled.includes(def)) enabled.push(def);
      if (enabled.length === 0 || !def) { alert('Enable at least one Space and pick a default.'); return; }
      await chrome.storage.local.set({
        rvLocal: { enabledSpaceIds: enabled, defaultSpaceId: def, lastUsedListSpaceId: def }
      });
      step.style.display = 'none';
      resolve();
    };
  });
}

async function completeOnboarding() {
  const userName = document.getElementById('user-name').value.trim();
  const categoryNames = Array.from(new Set(
    document.getElementById('initial-categories').value
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0)
  ));

  const firstSpaceName = (document.getElementById('first-space-name')?.value || '').trim() || 'My Bookmarks';
  const firstSpaceId = crypto.randomUUID();
  const now = new Date().toISOString();

  // initial-categories become the FIRST Space's categories.
  const categories = categoryNames.map((name, index) => ({
    spaceId: firstSpaceId,
    name: name,
    priority: index + 1
  }));

  const interval = parseInt(document.getElementById('default-interval').value);
  const threshold = parseInt(document.getElementById('priority-threshold').value);
  const gatewayApiKey = document.getElementById('gateway-api-key').value.trim();

  // Get selected providers and models from Step 5
  const youtubeProvider = document.getElementById('youtube-provider').value;
  const youtubeModel = document.getElementById('youtube-model').value;
  const transcriptProvider = document.getElementById('transcript-provider').value;
  const transcriptModel = document.getElementById('transcript-model').value;
  const pageProvider = document.getElementById('page-provider').value;
  const pageModel = document.getElementById('page-model').value;

  if (!userName || !gatewayApiKey) {
    alert('Please fill in your name and LLM Gateway API key.');
    return;
  }

  if (!youtubeProvider || !youtubeModel || !transcriptProvider || !transcriptModel || !pageProvider || !pageModel) {
    alert('Please select a provider and model for all three transaction types.');
    return;
  }

  const data = {
    spaces: [{ id: firstSpaceId, name: firstSpaceName, priority: 1, updatedAt: now }],
    bookmarks: [],
    categories: categories,
    settings: {
      userName,
      defaultIntervalDays: interval,
      onboardingComplete: true,
      priorityThresholdDays: threshold,
      llmGateway: {
        enabled: true,
        apiKey: gatewayApiKey,
        modelsData: modelsData, // SAVE MODELS DATA TO STORAGE
        transactions: {
          youtubeSummary: {
            provider: youtubeProvider,
            model: youtubeModel,
            options: { temperature: 0.7, maxTokens: 10000 }
          },
          transcriptFormatting: {
            provider: transcriptProvider,
            model: transcriptModel,
            options: { temperature: 0.3, maxTokens: 64000 }
          },
          pageSummary: {
            provider: pageProvider,
            model: pageModel,
            options: { temperature: 0.7, maxTokens: 2500 }
          }
        }
      },
      ollama: buildOllamaSettings(
        document.getElementById('ollama-local-url').value,
        document.getElementById('ollama-cloud-api-key').value
      )
    }
  };

  await chrome.storage.local.set({ rvData: data });
  await chrome.storage.local.set({
    rvLocal: { enabledSpaceIds: [firstSpaceId], defaultSpaceId: firstSpaceId, lastUsedListSpaceId: firstSpaceId }
  });
  window.location.href = 'list-modal.html';
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Account gate
  const haveAccountBtn = document.getElementById('gate-have-account-btn');
  const newUserBtn     = document.getElementById('gate-new-user-btn');
  const accountBackBtn = document.getElementById('account-back-btn');
  const accountSigninBtn = document.getElementById('account-signin-btn');
  if (haveAccountBtn) haveAccountBtn.addEventListener('click', showLoginPanel);
  if (newUserBtn)     newUserBtn.addEventListener('click', showWizardFromGate);
  if (accountBackBtn) accountBackBtn.addEventListener('click', showAccountChoice);
  if (accountSigninBtn) accountSigninBtn.addEventListener('click', handleGateSignIn);

  // Step 1 buttons
  const nextBtn1 = document.getElementById('next-btn-1');
  if (nextBtn1) {
    nextBtn1.addEventListener('click', nextStep);
  }

  // Step 2 buttons
  const prevBtn2 = document.getElementById('prev-btn-2');
  const nextBtn2 = document.getElementById('next-btn-2');
  if (prevBtn2) prevBtn2.addEventListener('click', prevStep);
  if (nextBtn2) nextBtn2.addEventListener('click', nextStep);

  // Step 3 buttons
  const prevBtn3 = document.getElementById('prev-btn-3');
  const nextBtn3 = document.getElementById('next-btn-3');
  if (prevBtn3) prevBtn3.addEventListener('click', prevStep);
  if (nextBtn3) nextBtn3.addEventListener('click', nextStep);

  // Step 4 buttons
  const prevBtn4 = document.getElementById('prev-btn-4');
  const nextBtn4 = document.getElementById('next-btn-4');
  if (prevBtn4) prevBtn4.addEventListener('click', prevStep);
  if (nextBtn4) {
    nextBtn4.addEventListener('click', async () => {
      // Test connection and fetch models before proceeding to Step 5
      const success = await testAndFetchModels();
      if (success) {
        nextStep();
      }
    });
  }

  // Step 5 buttons
  const prevBtn5 = document.getElementById('prev-btn-5');
  const nextBtn5 = document.getElementById('next-btn-5');
  if (prevBtn5) prevBtn5.addEventListener('click', prevStep);
  if (nextBtn5) nextBtn5.addEventListener('click', nextStep);

  // Step 6 (Spaces) buttons
  const prevBtn6 = document.getElementById('prev-btn-6');
  const completeBtn = document.getElementById('complete-btn');
  if (prevBtn6) prevBtn6.addEventListener('click', prevStep);
  if (completeBtn) completeBtn.addEventListener('click', completeOnboarding);

  // Provider change listeners for Step 5
  const youtubeProviderDropdown = document.getElementById('youtube-provider');
  const transcriptProviderDropdown = document.getElementById('transcript-provider');
  const pageProviderDropdown = document.getElementById('page-provider');

  if (youtubeProviderDropdown) {
    youtubeProviderDropdown.addEventListener('change', (e) => {
      updateModelDropdown('youtube-model', e.target.value);
    });
  }

  if (transcriptProviderDropdown) {
    transcriptProviderDropdown.addEventListener('change', (e) => {
      updateModelDropdown('transcript-model', e.target.value);
    });
  }

  if (pageProviderDropdown) {
    pageProviderDropdown.addEventListener('change', (e) => {
      updateModelDropdown('page-model', e.target.value);
    });
  }
});