document.addEventListener('DOMContentLoaded', () => {
  const liveCounterValue = document.getElementById('liveCounterValue');
  const nextIdTag = document.getElementById('nextIdTag');
  const formNextId = document.getElementById('formNextId');

  // Slot Machine Interactive Lever
  const pullLeverBtn = document.getElementById('pullLeverBtn');
  const reel1 = document.getElementById('reel1');
  const reel2 = document.getElementById('reel2');
  const reel3 = document.getElementById('reel3');
  const machineCaption = document.getElementById('machineCaption');

  const sampleIdeas = [
    { idea: 'AI FITNESS COACH BOT', outcome: '70/30 WINNER ($8.4K/MO)' },
    { idea: 'NICHE E-COM AD GENERATOR', outcome: '70/30 WINNER ($14.2K/MO)' },
    { idea: 'REAL ESTATE SCRIPT ENGINE', outcome: '70/30 WINNER ($6.9K/MO)' },
    { idea: 'CREATOR HOOK ARCHITECT', outcome: '70/30 WINNER ($11.5K/MO)' },
    { idea: 'B2B COLD OUTREACH SYSTEM', outcome: '70/30 WINNER ($19.0K/MO)' },
    { idea: 'YOUR CORE IDEA', outcome: '70/30 WINNER' }
  ];
  let leverIndex = 0;

  if (pullLeverBtn) {
    pullLeverBtn.addEventListener('click', () => {
      pullLeverBtn.disabled = true;
      let ticks = 0;
      const interval = setInterval(() => {
        const randomItem = sampleIdeas[Math.floor(Math.random() * sampleIdeas.length)];
        reel1.textContent = randomItem.idea;
        reel3.textContent = 'PULLING LEVER...';
        ticks++;
        if (ticks > 8) {
          clearInterval(interval);
          const selected = sampleIdeas[leverIndex % sampleIdeas.length];
          leverIndex++;
          reel1.textContent = selected.idea;
          reel2.textContent = '$3,000 AI TOOL';
          reel3.textContent = selected.outcome;
          machineCaption.textContent = `Lever pulled! Pair "${selected.idea}" with our $3,000 AI system and split the upside.`;
          pullLeverBtn.disabled = false;
        }
      }, 75);
    });
  }

  // Determine base path so API calls work whether hosted at / or /leverage-monetise/
  const basePath = window.location.pathname.startsWith('/leverage-monetise') ? '/leverage-monetise' : '';

  // Fetch Live Counter from Backend (Airtable + Local DB)
  async function refreshCounter() {
    try {
      const res = await fetch(`${basePath}/api/stats`);
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.totalProtected === 'number') {
        animateValue(liveCounterValue, parseInt(liveCounterValue.textContent, 10) || 14, data.totalProtected, 550);
      }
      if (data.nextIdPreview) {
        if (nextIdTag) nextIdTag.textContent = `Next ID: ${data.nextIdPreview}`;
        if (formNextId) formNextId.textContent = data.nextIdPreview;
      }
    } catch (err) {
      console.warn('Live counter offline fallback:', err);
    }
  }

  function animateValue(el, start, end, duration) {
    if (!el || start === end) return;
    const range = end - start;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      el.textContent = Math.floor(start + range * progress);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  refreshCounter();

  // Form Validation & Submission
  const form = document.getElementById('ideaSubmissionForm');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const trafficInput = document.getElementById('trafficSource');
  const coreIdeaInput = document.getElementById('coreIdea');
  const agreedInput = document.getElementById('agreed');

  const charCounter = document.getElementById('charCounter');
  const charProgressBar = document.getElementById('charProgressBar');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const successPanel = document.getElementById('submissionSuccessPanel');

  // Live Character Count for "The Core Idea" (Minimum 150 characters)
  if (coreIdeaInput) {
    coreIdeaInput.addEventListener('input', () => {
      const len = coreIdeaInput.value.trim().length;
      const pct = Math.min((len / 150) * 100, 100);
      charCounter.textContent = `${len} / 150 min characters`;
      charProgressBar.style.width = `${pct}%`;

      if (len >= 150) {
        charCounter.classList.add('valid');
        charProgressBar.classList.add('valid');
        setFieldError('coreIdea', '');
      } else {
        charCounter.classList.remove('valid');
        charProgressBar.classList.remove('valid');
      }
    });
  }

  function setFieldError(field, message) {
    const errEl = document.getElementById(`error-${field}`);
    const inputEl = document.getElementById(field);
    if (errEl) errEl.textContent = message || '';
    if (inputEl) {
      if (message) inputEl.classList.add('input-error');
      else inputEl.classList.remove('input-error');
    }
  }

  function validateForm() {
    let valid = true;

    const fullName = fullNameInput.value.trim();
    if (fullName.length < 2) {
      setFieldError('fullName', 'First & Last Name is required.');
      valid = false;
    } else {
      setFieldError('fullName', '');
    }

    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setFieldError('email', 'Required. Must be standard email format (your IP Agreement is sent here).');
      valid = false;
    } else {
      setFieldError('email', '');
    }

    const traffic = trafficInput.value.trim();
    if (!traffic.startsWith('https://')) {
      setFieldError('trafficSource', 'Required. URL must start with https://');
      valid = false;
    } else {
      try {
        new URL(traffic);
        setFieldError('trafficSource', '');
      } catch {
        setFieldError('trafficSource', 'Please enter a valid URL starting with https://');
        valid = false;
      }
    }

    const idea = coreIdeaInput.value.trim();
    if (idea.length < 150) {
      setFieldError(
        'coreIdea',
        `Minimum 150 characters required (currently ${idea.length}). A 3-word summary won't be accepted.`
      );
      valid = false;
    } else {
      setFieldError('coreIdea', '');
    }

    if (!agreedInput.checked) {
      setFieldError('agreed', 'Required. Please confirm the application & IP agreement checkbox.');
      valid = false;
    } else {
      setFieldError('agreed', '');
    }

    return valid;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm()) return;

      submitBtn.disabled = true;
      submitBtnText.textContent = 'Generating Unique ID & Signing IP Agreement...';

      try {
        const response = await fetch(`${basePath}/api/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
            trafficSource: trafficInput.value.trim(),
            coreIdea: coreIdeaInput.value.trim(),
            agreed: agreedInput.checked
          })
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          if (result.errors) {
            Object.entries(result.errors).forEach(([key, msg]) => setFieldError(key, msg));
          }
          submitBtn.disabled = false;
          submitBtnText.textContent = 'Protect & Submit My Idea (Zero Upfront Cost)';
          return;
        }

        // Update Live Counter & Show Certificate Panel
        await refreshCounter();

        document.getElementById('confirmedUniqueId').textContent = result.record.uniqueId;
        document.getElementById('certCreatorName').textContent = result.record.fullName;
        document.getElementById('certCreatorEmail').textContent = result.record.email;
        document.getElementById('certHash').textContent = result.record.signatureHash.slice(0, 32) + '...';
        document.getElementById('downloadAgreementBtn').href = `${basePath}${result.record.agreementUrl}`;

        form.classList.add('hidden');
        successPanel.classList.remove('hidden');
      } catch (err) {
        alert('Network error submitting your idea. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtnText.textContent = 'Protect & Submit My Idea (Zero Upfront Cost)';
      }
    });
  }

  const submitAnotherBtn = document.getElementById('submitAnotherBtn');
  if (submitAnotherBtn) {
    submitAnotherBtn.addEventListener('click', () => {
      form.reset();
      charCounter.textContent = '0 / 150 min characters';
      charProgressBar.style.width = '0%';
      charCounter.classList.remove('valid');
      charProgressBar.classList.remove('valid');
      successPanel.classList.add('hidden');
      form.classList.remove('hidden');
    });
  }
});
