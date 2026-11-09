document.addEventListener('DOMContentLoaded', () => {
  const liveCounterValue = document.getElementById('liveCounterValue');
  const nextIdTag = document.getElementById('nextIdTag');
  const formNextId = document.getElementById('formNextId');

  // Mobile Menu Drawer Toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileNavDrawer = document.getElementById('mobileNavDrawer');

  if (mobileMenuToggle && mobileNavDrawer) {
    mobileMenuToggle.addEventListener('click', () => {
      const isHidden = mobileNavDrawer.classList.toggle('hidden');
      mobileMenuToggle.setAttribute('aria-expanded', String(!isHidden));
    });

    mobileNavDrawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileNavDrawer.classList.add('hidden');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

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
          reel2.textContent = '$19,458+ AI TOOL';
          reel3.textContent = selected.outcome;
          machineCaption.textContent = `Lever pulled! Pair "${selected.idea}" with our $19,458+ AI system and split the upside.`;
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

  // Form Validation, Phone OTP Verification & Submission
  const form = document.getElementById('ideaSubmissionForm');
  const companyWebsiteInput = document.getElementById('companyWebsite');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpVerificationBox = document.getElementById('otpVerificationBox');
  const otpDispatchNotice = document.getElementById('otpDispatchNotice');
  const otpCodeInput = document.getElementById('otpCode');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const phoneVerifiedBadge = document.getElementById('phoneVerifiedBadge');

  const coreIdeaInput = document.getElementById('coreIdea');
  const agreedInput = document.getElementById('agreed');

  const charCounter = document.getElementById('charCounter');
  const charProgressBar = document.getElementById('charProgressBar');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const successPanel = document.getElementById('submissionSuccessPanel');

  let verifiedPhoneToken = null;
  let verifiedPhoneNumber = null;

  // Reset verification if phone number is edited
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      if (verifiedPhoneNumber && phoneInput.value.trim() !== verifiedPhoneNumber) {
        verifiedPhoneToken = null;
        verifiedPhoneNumber = null;
        phoneVerifiedBadge.classList.add('hidden');
        sendOtpBtn.textContent = 'Send OTP';
        sendOtpBtn.disabled = false;
      }
    });
  }

  // Send OTP Handler
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const rawPhone = phoneInput.value.trim();
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setFieldError('phone', 'Please enter a valid phone number with country code (e.g., +1 437 707 4889).');
        return;
      }

      setFieldError('phone', '');
      sendOtpBtn.disabled = true;
      sendOtpBtn.textContent = 'Sending...';

      try {
        const res = await fetch(`${basePath}/api/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: rawPhone,
            email: emailInput ? emailInput.value.trim() : ''
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setFieldError('phone', data.error || 'Failed to send OTP. Please check your number.');
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = 'Send OTP';
          return;
        }

        phoneInput.value = data.phone;
        otpVerificationBox.classList.remove('hidden');
        otpDispatchNotice.textContent = '';

        if (data.dispatchCode) {
          otpDispatchNotice.appendChild(
            document.createTextNode(`Verification code generated for ${data.phone}: `)
          );
          const codeStrong = document.createElement('strong');
          codeStrong.textContent = data.dispatchCode;
          otpDispatchNotice.appendChild(codeStrong);
          otpDispatchNotice.appendChild(
            document.createTextNode(' — Enter this 6-digit code below to verify.')
          );
        } else {
          otpDispatchNotice.textContent = data.message || `Enter the 6-digit OTP sent to ${data.phone}.`;
        }

        otpCodeInput.focus();
        sendOtpBtn.textContent = 'Resend OTP';
        sendOtpBtn.disabled = false;
      } catch (err) {
        setFieldError('phone', 'Network error sending OTP. Please try again.');
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Send OTP';
      }
    });
  }

  // Verify OTP Handler
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const rawPhone = phoneInput.value.trim();
      const code = otpCodeInput.value.trim();
      if (!/^\d{6}$/.test(code)) {
        setFieldError('phone', 'Please enter the 6-digit numeric OTP code.');
        return;
      }

      setFieldError('phone', '');
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = 'Verifying...';

      try {
        const res = await fetch(`${basePath}/api/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: rawPhone, code })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setFieldError('phone', data.error || 'Invalid OTP code.');
          verifyOtpBtn.disabled = false;
          verifyOtpBtn.textContent = 'Verify Code';
          return;
        }

        verifiedPhoneToken = data.phoneVerificationToken;
        verifiedPhoneNumber = data.phone;
        phoneInput.value = data.phone;

        otpVerificationBox.classList.add('hidden');
        phoneVerifiedBadge.classList.remove('hidden');
        sendOtpBtn.textContent = 'Verified ✓';
        sendOtpBtn.disabled = true;
        setFieldError('phone', '');
      } catch (err) {
        setFieldError('phone', 'Network error verifying OTP. Please try again.');
      } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = 'Verify Code';
      }
    });
  }

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

    const phone = phoneInput.value.trim();
    if (!phone || !verifiedPhoneToken || phone !== verifiedPhoneNumber) {
      setFieldError('phone', 'Required. Please enter your phone number, click "Send OTP", and verify the 6-digit code before submitting.');
      valid = false;
    } else {
      setFieldError('phone', '');
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
            companyWebsite: companyWebsiteInput ? companyWebsiteInput.value : '',
            fullName: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: verifiedPhoneNumber,
            phoneVerificationToken: verifiedPhoneToken,
            coreIdea: coreIdeaInput.value.trim(),
            agreed: agreedInput.checked
          })
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          if (result.errors) {
            Object.entries(result.errors).forEach(([key, msg]) => setFieldError(key, msg));
          } else if (result.error) {
            setFieldError('coreIdea', result.error);
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
        const certPhoneEl = document.getElementById('certCreatorPhone');
        if (certPhoneEl) certPhoneEl.textContent = `${result.record.phone} (OTP Verified)`;
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
      verifiedPhoneToken = null;
      verifiedPhoneNumber = null;
      phoneVerifiedBadge.classList.add('hidden');
      otpVerificationBox.classList.add('hidden');
      sendOtpBtn.textContent = 'Send OTP';
      sendOtpBtn.disabled = false;
      charCounter.textContent = '0 / 150 min characters';
      charProgressBar.style.width = '0%';
      charCounter.classList.remove('valid');
      charProgressBar.classList.remove('valid');
      successPanel.classList.add('hidden');
      form.classList.remove('hidden');
    });
  }
});
