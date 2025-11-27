let currentStep = 1;

function nextStep() {
  if (currentStep < 4) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateStepIndicator();
  }
}

function prevStep() {
  if (currentStep > 1) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep--;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    updateStepIndicator();
  }
}

function updateStepIndicator() {
  document.querySelectorAll('.step-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx + 1 <= currentStep);
  });
}

async function completeOnboarding() {
  const userName = document.getElementById('user-name').value.trim();
  const categories = document.getElementById('initial-categories').value
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0);
  const interval = parseInt(document.getElementById('default-interval').value);
  const threshold = parseInt(document.getElementById('priority-threshold').value);
  const gatewayApiKey = document.getElementById('gateway-api-key').value.trim();

  if (!userName || !gatewayApiKey) {
    alert('Please fill in your name and LLM Gateway API key.');
    return;
  }

  const data = {
    bookmarks: [],
    categories: categories,
    settings: {
      userName,
      defaultIntervalDays: interval,
      apiKey: '',           // DEPRECATED: Keep for backward compatibility
      groqApiKey: '',       // DEPRECATED: Keep for backward compatibility
      onboardingComplete: true,
      priorityThresholdDays: threshold,
      // DEPRECATED: Old providers config
      providers: {
        summary: 'anthropic',
        formatting: 'groq'
      },
      // NEW: LLM Gateway configuration
      llmGateway: {
        enabled: true,
        apiKey: gatewayApiKey,
        transactions: {
          youtubeSummary: {
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            options: { temperature: 0.7, maxTokens: 10000 }
          },
          transcriptFormatting: {
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            options: { temperature: 0.3, maxTokens: 64000 }
          },
          pageSummary: {
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            options: { temperature: 0.7, maxTokens: 2500 }
          }
        }
      }
    }
  };

  await chrome.storage.local.set({ rvData: data });
  window.location.href = 'list-modal.html';
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
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
  const completeBtn = document.getElementById('complete-btn');
  if (prevBtn4) prevBtn4.addEventListener('click', prevStep);
  if (completeBtn) completeBtn.addEventListener('click', completeOnboarding);
});