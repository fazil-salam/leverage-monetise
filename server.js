require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_OFFSET = parseInt(process.env.BASE_COUNTER_OFFSET || '14', 10);

// Trust Nginx & Cloudflare reverse proxy for accurate client IP rate-limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Strict CORS Policy
const allowedOrigins = [
  'https://leveragemonetise.com',
  'https://www.leveragemonetise.com',
  'https://fazil.fyi',
  'https://www.fazil.fyi',
  'http://localhost:3000',
  'http://localhost:3004'
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST']
  })
);

// Strict JSON body size limit (16kb) to prevent payload DoS attacks
app.use(express.json({ limit: '16kb', strict: true }));

// Global API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests from this IP. Please try again shortly.' }
});

// OTP Request Rate Limiter
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many OTP requests. Please wait a few minutes and try again.' }
});

// Strict Submission & PDF Generation Rate Limiter
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Submission rate limit reached. Please wait a few minutes before submitting again.' }
});

app.use('/api/', apiLimiter);

const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const AGREEMENTS_DIR = path.join(DATA_DIR, 'agreements');

// Ensure data directories exist with restricted permissions (0700)
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
if (!fs.existsSync(AGREEMENTS_DIR)) fs.mkdirSync(AGREEMENTS_DIR, { recursive: true, mode: 0o700 });
if (!fs.existsSync(SUBMISSIONS_FILE)) {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify([], null, 2), { encoding: 'utf8', mode: 0o600 });
}

app.use(
  express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    maxAge: '1h'
  })
);

// In-memory store for OTP sessions (auto-cleaned after expiry)
const otpStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (now > val.expiresAt + 10 * 60 * 1000) {
      otpStore.delete(key);
    }
  }
}, 60 * 1000).unref();

// Sanitize text input (strip control chars, HTML angle brackets, and enforce length)
function sanitizeText(input, maxLen = 2000) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

// Normalize phone number (keep leading + and digits)
function normalizePhone(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input.replace(/[^\d+]/g, '');
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return '';
  return cleaned.startsWith('+') ? `+${digitsOnly}` : `+${digitsOnly}`;
}

// Helper to read/write local database atomically
function getSubmissions() {
  try {
    const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveSubmissions(submissions) {
  const tmpFile = `${SUBMISSIONS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(submissions, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpFile, SUBMISSIONS_FILE);
}

// Generate Single-Page PDF IP Protection Agreement (Strictly 1 Page, Zero Overlap)
function generateAgreementPDF(record, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const stream = fs.createWriteStream(outputPath, { mode: 0o600 });
    doc.pipe(stream);

    // 1. Header Banner (0..105)
    doc.rect(0, 0, doc.page.width, 105).fill('#070913');
    doc.fillColor('#9FEF00').fontSize(8.2).font('Helvetica-Bold')
      .text('OFFICIAL INTELLECTUAL PROPERTY & PARTNERSHIP RECORD', 45, 26, {
        characterSpacing: 0.7,
        lineBreak: false
      });
    doc.fillColor('#FFFFFF').fontSize(21).font('Helvetica-Bold')
      .text('LEVERAGE MONETISE', 45, 44, { lineBreak: false });
    doc.fillColor('#388BFF').fontSize(9.5).font('Helvetica')
      .text('PULL THE LEVER TOGETHER  |  VIP Member of AI Income Challenge', 45, 73, { lineBreak: false });

    // Badge on right of header (x: 410..550, y: 27..77) — zero overlap with left title
    doc.roundedRect(doc.page.width - 180, 27, 135, 50, 6).fillAndStroke('#11162B', '#388BFF');
    doc.fillColor('#94A3B8').fontSize(7.5).font('Helvetica-Bold')
      .text('UNIQUE TRACKING ID', doc.page.width - 168, 37, { lineBreak: false });
    doc.fillColor('#9FEF00').fontSize(15).font('Helvetica-Bold')
      .text(record.uniqueId, doc.page.width - 168, 51, { lineBreak: false });

    let y = 122;

    // 2. Document Title & Intro
    doc.fillColor('#0F172A').fontSize(14.5).font('Helvetica-Bold')
      .text('IDEA VALIDATION & IP OWNERSHIP AGREEMENT', 45, y, { lineBreak: false });
    y += 20;

    doc.fillColor('#475569').fontSize(9.2).font('Helvetica')
      .text(
        `This Intellectual Property Ownership & Non-Disclosure Validation Certificate ("Agreement") is automatically executed and registered on ${new Date(record.createdAt).toUTCString()} between Leverage Monetise ("Builder Partner") and ${record.fullName} ("Creator / Idea Partner").`,
        45, y, { width: doc.page.width - 90, lineGap: 2.5 }
      );
    y = doc.y + 12;

    // 3. Metadata Box (Includes Verified Phone Number)
    const metaHeight = 86;
    doc.roundedRect(45, y, doc.page.width - 90, metaHeight, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold');
    doc.text('REGISTRATION ID:', 60, y + 12, { lineBreak: false });
    doc.text('CREATOR NAME:', 60, y + 29, { lineBreak: false });
    doc.text('VERIFIED EMAIL:', 60, y + 46, { lineBreak: false });
    doc.text('VERIFIED PHONE:', 60, y + 63, { lineBreak: false });

    doc.fillColor('#334155').fontSize(8.5).font('Helvetica');
    doc.text(`${record.uniqueId} (SHA-256 Hash: ${record.signatureHash.slice(0, 24)}...)`, 175, y + 12, { lineBreak: false });
    doc.text(record.fullName, 175, y + 29, { lineBreak: false });
    doc.text(record.email, 175, y + 46, { lineBreak: false });
    doc.text(`${record.phone || 'Verified'} (OTP Verified)`, 175, y + 63, { lineBreak: false });

    y += metaHeight + 14;

    // 4. Submitted Core Idea Section
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
      .text('1. PROTECTED CORE IDEA SUBMISSION', 45, y, { lineBreak: false });
    y += 15;

    const ideaText = record.coreIdea.length > 750 ? record.coreIdea.slice(0, 750) + '...' : record.coreIdea;
    const ideaBoxHeight = 96;
    doc.roundedRect(45, y, doc.page.width - 90, ideaBoxHeight, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#1E293B').fontSize(8.8).font('Helvetica-Oblique')
      .text(`"${ideaText}"`, 58, y + 11, {
        width: doc.page.width - 116,
        height: ideaBoxHeight - 20,
        ellipsis: true,
        lineGap: 2
      });

    y += ideaBoxHeight + 14;

    // 5. Legal Clauses
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
      .text('2. INTELLECTUAL PROPERTY OWNERSHIP & PROTECTION', 45, y, { lineBreak: false });
    y += 14;
    doc.fillColor('#334155').fontSize(8.8).font('Helvetica')
      .text(
        'The Creator retains 100% legal ownership of the underlying Core Idea described above. Leverage Monetise acknowledges that this submission is received in strict confidence solely for the purpose of evaluating and potentially co-building the digital product using our AI software system (valued at $19,458+). Leverage Monetise shall not replicate, commercialize, or distribute the Creator\'s unique concept independently without an active partnership with the Creator.',
        45, y, { width: doc.page.width - 90, lineGap: 2 }
      );
    y = doc.y + 12;

    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
      .text('3. PARTNERSHIP PROFIT SPLIT STRUCTURE', 45, y, { lineBreak: false });
    y += 14;
    doc.fillColor('#334155').fontSize(8.8).font('Helvetica')
      .text(
        'Should this application be selected for development under the AI Income Challenge Partnership Hub, both parties agree to the following transparent two-phase revenue split:\n' +
        '• Phase 1 (The Recoup Phase — 50/50 Split): All net profits generated by the product are split evenly (50% Creator / 50% Leverage Monetise) until the initial $1,997 USD software and tool investment is recouped.\n' +
        '• Phase 2 (The Growth Phase — 70/30 Split): Once the initial investment is recouped, the Creator keeps 70% of all future net profits for bringing the core idea and marketing, while Leverage Monetise retains 30% for ongoing technical management, infrastructure, and platform fees.',
        45, y, { width: doc.page.width - 90, lineGap: 2 }
      );
    y = doc.y + 12;

    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold')
      .text('4. PRODUCT CLARITY & FOLLOW-UP COMMUNICATION', 45, y, { lineBreak: false });
    y += 14;
    doc.fillColor('#334155').fontSize(8.8).font('Helvetica')
      .text(
        'If our engineering and product team requires additional clarity, feature specifications, or audience insights, we will reach out to you directly via email (leveragemonetise@gmail.com) and your verified phone number to collaborate and build the most complete, high-converting digital product possible from your idea.',
        45, y, { width: doc.page.width - 90, lineGap: 2 }
      );
    y = doc.y + 18;

    // 6. Signatures (Strictly kept on Page 1 using lineBreak: false)
    doc.moveTo(45, y).lineTo(doc.page.width - 45, y).strokeColor('#CBD5E1').stroke();
    y += 12;

    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold')
      .text('AUTHORIZED & DIGITALLY SIGNED BY:', 45, y, { lineBreak: false });
    doc.text('ACKNOWLEDGED BY CREATOR:', 315, y, { lineBreak: false });
    y += 15;

    doc.fillColor('#1570EF').fontSize(13).font('Helvetica-BoldOblique')
      .text('Leverage Monetise', 45, y, { lineBreak: false });
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-BoldOblique')
      .text(record.fullName, 315, y, { lineBreak: false });
    y += 18;

    doc.fillColor('#64748B').fontSize(8).font('Helvetica')
      .text('Founder, Leverage Monetise (VIP Member of AI Income Challenge)', 45, y, { lineBreak: false });
    doc.text(`Digital Timestamp: ${record.createdAt}`, 315, y, { lineBreak: false });
    y += 12;

    doc.text('Email: leveragemonetise@gmail.com', 45, y, { lineBreak: false });
    doc.text(`Verification ID: ${record.uniqueId}  |  Phone: ${record.phone || 'Verified'}`, 315, y, { lineBreak: false });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// GET /api/stats — Live counter endpoint (supports Airtable or local DB)
app.get('/api/stats', async (req, res) => {
  const submissions = getSubmissions();
  let airtableCount = null;

  if (process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID) {
    try {
      const table = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME || 'Submissions');
      const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${table}?pageSize=100`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}` }
      });
      if (response.ok) {
        const data = await response.json();
        airtableCount = Array.isArray(data.records) ? data.records.length : null;
      }
    } catch (e) {
      console.error('Airtable fetch warning:', e.message);
    }
  }

  const localCount = submissions.length;
  const totalProtected = BASE_OFFSET + (airtableCount !== null ? Math.max(airtableCount, localCount) : localCount);
  const nextNumber = totalProtected + 1;

  res.json({
    totalProtected,
    localSubmissions: localCount,
    latestId: `ID-${String(totalProtected).padStart(3, '0')}`,
    nextIdPreview: `ID-${String(nextNumber).padStart(3, '0')}`
  });
});

// POST /api/send-otp — Generates 6-digit OTP for phone verification
app.post('/api/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, email } = req.body || {};
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Please enter a valid phone number with country code (e.g., +1 437 707 4889).'
      });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(cleanPhone, {
      code,
      expiresAt,
      attempts: 0,
      verified: false,
      token: null
    });

    let deliveryChannel = 'instant';

    // 1. Optional Twilio SMS Delivery if configured in .env
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
      try {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const params = new URLSearchParams({
          To: cleanPhone,
          From: process.env.TWILIO_FROM_NUMBER,
          Body: `[Leverage Monetise] Your phone verification OTP code is: ${code}`
        });
        const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        if (twRes.ok) deliveryChannel = 'sms';
      } catch (err) {
        console.error('Twilio SMS error:', err.message);
      }
    }

    // 2. Optional Email OTP mirror if SMTP is configured and email provided
    if (deliveryChannel !== 'sms' && process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD && email) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_APP_PASSWORD
          }
        });
        await transporter.sendMail({
          from: `"Leverage Monetise" <${process.env.SMTP_EMAIL}>`,
          to: sanitizeText(email, 160),
          subject: `Your Verification Code: ${code} — Leverage Monetise`,
          text: `Your Leverage Monetise verification code for phone number ${cleanPhone} is: ${code}\n\nThis code expires in 10 minutes.`
        });
        deliveryChannel = 'email';
      } catch (err) {
        console.error('OTP email fallback error:', err.message);
      }
    }

    return res.json({
      ok: true,
      phone: cleanPhone,
      deliveryChannel,
      // When no external SMS gateway is configured yet, return instant dispatch code so the user can complete OTP verification seamlessly
      dispatchCode: deliveryChannel === 'instant' ? code : undefined,
      message:
        deliveryChannel === 'sms'
          ? `6-digit OTP sent via SMS to ${cleanPhone}.`
          : `6-digit verification code generated for ${cleanPhone}.`
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ ok: false, error: 'Could not generate OTP. Please try again.' });
  }
});

// POST /api/verify-otp — Verifies the 6-digit OTP and returns a signed verification token
app.post('/api/verify-otp', otpLimiter, (req, res) => {
  const { phone, code } = req.body || {};
  const cleanPhone = normalizePhone(phone);
  const cleanCode = String(code || '').replace(/\D/g, '');

  if (!cleanPhone || cleanCode.length !== 6) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid 6-digit OTP code.' });
  }

  const entry = otpStore.get(cleanPhone);
  if (!entry) {
    return res.status(400).json({ ok: false, error: 'No active OTP found for this phone number. Please click Send OTP first.' });
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanPhone);
    return res.status(400).json({ ok: false, error: 'OTP has expired. Please request a new code.' });
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpStore.delete(cleanPhone);
    return res.status(400).json({ ok: false, error: 'Too many incorrect attempts. Please request a new OTP.' });
  }

  if (entry.code !== cleanCode) {
    return res.status(400).json({ ok: false, error: 'Incorrect OTP code. Please check and try again.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  entry.verified = true;
  entry.token = token;
  otpStore.set(cleanPhone, entry);

  return res.json({
    ok: true,
    phone: cleanPhone,
    phoneVerificationToken: token
  });
});

// POST /api/submit — Validates form + verified OTP token, generates Unique ID + PDF IP Agreement
app.post('/api/submit', submitLimiter, async (req, res) => {
  try {
    const { companyWebsite, fullName, email, phone, phoneVerificationToken, coreIdea, agreed } = req.body || {};

    // Honeypot bot check
    if (companyWebsite && String(companyWebsite).trim().length > 0) {
      return res.status(400).json({ ok: false, error: 'Invalid submission request.' });
    }

    const cleanName = sanitizeText(fullName, 120);
    const cleanEmail = sanitizeText(email, 160).toLowerCase();
    const cleanPhone = normalizePhone(phone);
    const cleanIdea = sanitizeText(coreIdea, 4000);

    // Strict Validation Rules
    const errors = {};
    if (!cleanName || cleanName.length < 2) {
      errors.fullName = 'First & Last Name is required.';
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      errors.email = 'Please enter a valid standard email address.';
    }

    if (!cleanPhone) {
      errors.phone = 'Valid phone number is required.';
    } else {
      const otpSession = otpStore.get(cleanPhone);
      if (!otpSession || !otpSession.verified || !phoneVerificationToken || otpSession.token !== phoneVerificationToken) {
        errors.phone = 'Please verify your phone number with the 6-digit OTP before submitting.';
      }
    }

    if (!cleanIdea || cleanIdea.length < 150) {
      errors.coreIdea = `The Core Idea must be at least 150 characters (currently ${cleanIdea.length} characters).`;
    }

    if (agreed !== true) {
      errors.agreed = 'You must agree to the application terms and IP agreement delivery.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ ok: false, errors });
    }

    // Consume OTP session so it cannot be replayed
    otpStore.delete(cleanPhone);

    const submissions = getSubmissions();
    const sequenceNum = BASE_OFFSET + submissions.length + 1;
    const uniqueId = `ID-${String(sequenceNum).padStart(3, '0')}`;
    const createdAt = new Date().toISOString();
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${uniqueId}|${cleanName}|${cleanEmail}|${cleanPhone}|${cleanIdea}|${createdAt}`)
      .digest('hex');

    const record = {
      uniqueId,
      sequenceNum,
      fullName: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      phoneVerified: true,
      coreIdea: cleanIdea,
      agreed: true,
      createdAt,
      signatureHash
    };

    // 1. Generate Single-Page PDF IP Agreement
    const pdfFilename = `Leverage-Monetise-IP-Agreement-${uniqueId}.pdf`;
    const pdfPath = path.join(AGREEMENTS_DIR, pdfFilename);
    await generateAgreementPDF(record, pdfPath);

    // 2. Save to local database
    submissions.push(record);
    saveSubmissions(submissions);

    // 3. Optional Airtable Sync
    let airtableSynced = false;
    if (process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID) {
      try {
        const table = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME || 'Submissions');
        const atRes = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${table}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Unique ID': record.uniqueId,
              'First & Last Name': record.fullName,
              'Email Address': record.email,
              'Phone Number': record.phone,
              'The Core Idea': record.coreIdea,
              'Agreement Checkbox': true,
              'Submitted At': record.createdAt
            }
          })
        });
        airtableSynced = atRes.ok;
      } catch (err) {
        console.error('Airtable sync error:', err.message);
      }
    }

    // 4. Optional Zapier / Make.com Webhook Trigger
    let webhookTriggered = false;
    if (process.env.WEBHOOK_URL) {
      try {
        const whRes = await fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...record,
            agreementDownloadUrl: `/api/agreement/${record.uniqueId}`
          })
        });
        webhookTriggered = whRes.ok;
      } catch (err) {
        console.error('Webhook trigger error:', err.message);
      }
    }

    // 5. Optional Direct Email Delivery from leveragemonetise@gmail.com
    let emailSent = false;
    if (process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_APP_PASSWORD
          }
        });

        await transporter.sendMail({
          from: `"Leverage Monetise" <${process.env.SMTP_EMAIL}>`,
          to: record.email,
          cc: process.env.SMTP_EMAIL,
          subject: `[${record.uniqueId}] Your Protected Idea Submission & Signed IP Agreement — Leverage Monetise`,
          text: `Hi ${record.fullName},\n\nYour idea submission has been logged and assigned Unique ID: ${record.uniqueId}.\n\nAttached to this email is your signed Idea Validation & IP Ownership Agreement cementing your 100% ownership of the core idea.\n\nIf we need more clarity on your concept, we will reach out to you directly through email (leveragemonetise@gmail.com) or your verified phone number (${record.phone}) so we can build the perfect digital product from your idea.\n\nSubmitted Idea Summary:\n"${record.coreIdea}"\n\nBest regards,\nLeverage Monetise\nVIP member of AI Income Challenge\nleveragemonetise@gmail.com`,
          attachments: [
            {
              filename: pdfFilename,
              path: pdfPath
            }
          ]
        });
        emailSent = true;
      } catch (err) {
        console.error('Email send error:', err.message);
      }
    }

    return res.status(201).json({
      ok: true,
      record: {
        uniqueId: record.uniqueId,
        fullName: record.fullName,
        email: record.email,
        phone: record.phone,
        createdAt: record.createdAt,
        signatureHash: record.signatureHash,
        agreementUrl: `/api/agreement/${record.uniqueId}`
      },
      totalProtected: BASE_OFFSET + submissions.length,
      integrations: {
        airtableSynced,
        webhookTriggered,
        emailSent
      }
    });
  } catch (err) {
    console.error('Submission error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error processing submission.' });
  }
});

// GET /api/agreement/:uniqueId — Download the generated IP Protection Agreement PDF
app.get('/api/agreement/:uniqueId', async (req, res) => {
  const { uniqueId } = req.params;
  if (!/^ID-\d{3,6}$/.test(String(uniqueId))) {
    return res.status(400).json({ error: 'Invalid Tracking ID format.' });
  }

  const safeId = String(uniqueId);
  const pdfPath = path.join(AGREEMENTS_DIR, `Leverage-Monetise-IP-Agreement-${safeId}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    const submissions = getSubmissions();
    const record = submissions.find((s) => s.uniqueId === safeId);
    if (!record) {
      return res.status(404).json({ error: 'IP Agreement not found for this ID.' });
    }
    await generateAgreementPDF(record, pdfPath);
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Leverage-Monetise-IP-Agreement-${safeId}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Leverage Monetise server listening securely on 127.0.0.1:${PORT}`);
});
