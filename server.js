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

// Strict Submission & PDF Generation Rate Limiter (prevents spam & disk exhaustion)
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

// Sanitize text input (strip control chars, HTML angle brackets, and enforce length)
function sanitizeText(input, maxLen = 2000) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
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

// Generate PDF IP Protection Agreement
function generateAgreementPDF(record, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath, { mode: 0o600 });
    doc.pipe(stream);

    // Header Banner
    doc.rect(0, 0, doc.page.width, 110).fill('#070913');
    doc.fillColor('#9FEF00').fontSize(10).font('Helvetica-Bold')
      .text('OFFICIAL INTELLECTUAL PROPERTY & PARTNERSHIP RECORD', 50, 32, { characterSpacing: 1.5 });
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold')
      .text('LEVERAGE MONETISE', 50, 50);
    doc.fillColor('#388BFF').fontSize(10).font('Helvetica')
      .text('PULL THE LEVER TOGETHER  |  VIP Member of AI Income Challenge', 50, 78);

    // Badge on right of header
    doc.roundedRect(doc.page.width - 180, 35, 130, 46, 6).fillAndStroke('#11162B', '#388BFF');
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold')
      .text('UNIQUE TRACKING ID', doc.page.width - 170, 45);
    doc.fillColor('#9FEF00').fontSize(15).font('Helvetica-Bold')
      .text(record.uniqueId, doc.page.width - 170, 58);

    doc.moveDown(4);
    let y = 135;

    // Title
    doc.fillColor('#0F172A').fontSize(16).font('Helvetica-Bold')
      .text('IDEA VALIDATION & IP OWNERSHIP AGREEMENT', 50, y);
    y += 25;

    doc.fillColor('#475569').fontSize(10).font('Helvetica')
      .text(
        `This Intellectual Property Ownership & Non-Disclosure Validation Certificate ("Agreement") is automatically executed and registered on ${new Date(record.createdAt).toUTCString()} between Leverage Monetise ("Builder Partner") and ${record.fullName} ("Creator / Idea Partner").`,
        50, y, { width: doc.page.width - 100, lineGap: 4 }
      );
    y = doc.y + 18;

    // Metadata Box
    doc.roundedRect(50, y, doc.page.width - 100, 78, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold');
    doc.text('REGISTRATION ID:', 65, y + 14);
    doc.text('CREATOR NAME:', 65, y + 32);
    doc.text('VERIFIED EMAIL:', 65, y + 50);

    doc.fillColor('#334155').fontSize(9).font('Helvetica');
    doc.text(`${record.uniqueId} (SHA-256 Hash: ${record.signatureHash.slice(0, 24)}...)`, 185, y + 14);
    doc.text(record.fullName, 185, y + 32);
    doc.text(record.email, 185, y + 50);

    y += 98;

    // Submitted Core Idea Section
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold')
      .text('1. PROTECTED CORE IDEA SUBMISSION', 50, y);
    y += 18;

    const ideaText = record.coreIdea.length > 950 ? record.coreIdea.slice(0, 950) + '...' : record.coreIdea;
    doc.roundedRect(50, y, doc.page.width - 100, 120, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#1E293B').fontSize(9.5).font('Helvetica-Oblique')
      .text(`"${ideaText}"`, 65, y + 14, { width: doc.page.width - 130, height: 95, lineGap: 3 });

    y += 140;

    // Legal Clauses
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold')
      .text('2. INTELLECTUAL PROPERTY OWNERSHIP & PROTECTION', 50, y);
    y += 16;
    doc.fillColor('#334155').fontSize(9.5).font('Helvetica')
      .text(
        'The Creator retains 100% legal ownership of the underlying Core Idea described above. Leverage Monetise acknowledges that this submission is received in strict confidence solely for the purpose of evaluating and potentially co-building the digital product using our AI software system (valued at $19,458+). Leverage Monetise shall not replicate, commercialize, or distribute the Creator\'s unique concept independently without an active partnership with the Creator.',
        50, y, { width: doc.page.width - 100, lineGap: 3 }
      );
    y = doc.y + 16;

    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold')
      .text('3. PARTNERSHIP PROFIT SPLIT STRUCTURE', 50, y);
    y += 16;
    doc.fillColor('#334155').fontSize(9.5).font('Helvetica')
      .text(
        'Should this application be selected for development under the AI Income Challenge Partnership Hub, both parties agree to the following transparent two-phase revenue split:\n' +
        '• Phase 1 (The Recoup Phase — 50/50 Split): All net profits generated by the product are split evenly (50% Creator / 50% Leverage Monetise) until the initial $1,997 USD software and tool investment is recouped.\n' +
        '• Phase 2 (The Growth Phase — 70/30 Split): Once the initial investment is recouped, the Creator keeps 70% of all future net profits for bringing the core idea and marketing, while Leverage Monetise retains 30% for ongoing technical management, infrastructure, and platform fees.',
        50, y, { width: doc.page.width - 100, lineGap: 3 }
      );
    y = doc.y + 24;

    // Signatures
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#CBD5E1').stroke();
    y += 18;

    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold')
      .text('AUTHORIZED & DIGITALLY SIGNED BY:', 50, y);
    doc.text('ACKNOWLEDGED BY CREATOR:', 320, y);
    y += 18;

    doc.fillColor('#1570EF').fontSize(14).font('Helvetica-BoldOblique')
      .text('Leverage Monetise', 50, y);
    doc.fillColor('#0F172A').fontSize(14).font('Helvetica-BoldOblique')
      .text(record.fullName, 320, y);
    y += 20;

    doc.fillColor('#64748B').fontSize(8.5).font('Helvetica')
      .text('Founder, Leverage Monetise (VIP Member of AI Income Challenge)\nEmail: leveragemonetise@gmail.com', 50, y);
    doc.text(`Digital Timestamp: ${record.createdAt}\nVerification ID: ${record.uniqueId}`, 320, y);

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

// POST /api/submit — Validates form, generates Unique ID + PDF IP Agreement, syncs Airtable/Zapier/Email
app.post('/api/submit', submitLimiter, async (req, res) => {
  try {
    const { companyWebsite, fullName, email, coreIdea, agreed } = req.body || {};

    // Honeypot bot check: if the hidden field is filled, silently reject
    if (companyWebsite && String(companyWebsite).trim().length > 0) {
      return res.status(400).json({ ok: false, error: 'Invalid submission request.' });
    }

    const cleanName = sanitizeText(fullName, 120);
    const cleanEmail = sanitizeText(email, 160).toLowerCase();
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

    if (!cleanIdea || cleanIdea.length < 150) {
      errors.coreIdea = `The Core Idea must be at least 150 characters (currently ${cleanIdea.length} characters).`;
    }

    if (agreed !== true) {
      errors.agreed = 'You must agree to the application terms and IP agreement delivery.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ ok: false, errors });
    }

    const submissions = getSubmissions();
    const sequenceNum = BASE_OFFSET + submissions.length + 1;
    const uniqueId = `ID-${String(sequenceNum).padStart(3, '0')}`;
    const createdAt = new Date().toISOString();
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${uniqueId}|${cleanName}|${cleanEmail}|${cleanIdea}|${createdAt}`)
      .digest('hex');

    const record = {
      uniqueId,
      sequenceNum,
      fullName: cleanName,
      email: cleanEmail,
      coreIdea: cleanIdea,
      agreed: true,
      createdAt,
      signatureHash
    };

    // 1. Generate PDF IP Agreement
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
          text: `Hi ${record.fullName},\n\nYour idea submission has been logged and assigned Unique ID: ${record.uniqueId}.\n\nAttached to this email is your signed Idea Validation & IP Ownership Agreement cementing your 100% ownership of the core idea.\n\nSubmitted Idea Summary:\n"${record.coreIdea}"\n\nWe will review your application and reach out regarding next steps to pull the lever together.\n\nBest regards,\nLeverage Monetise\nVIP member of AI Income Challenge\nleveragemonetise@gmail.com`,
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
  // Strict regex validation to block any path traversal attempt
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
