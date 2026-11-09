# Leverage Monetise — Pull The Lever Together

An exclusive partnership hub for **AI Income Challenge** members who want to launch digital products without fronting the $3,000 software cost.

![Leverage Monetise Banner](public/assets/logo-banner.jpg)

## Overview & Blueprint Architecture

1. **Navigation Bar**: Logo (`Leverage Monetise`), Quick Links (`How it Works`, `The Split`, `IP Protection`), and `Submit Idea` CTA.
2. **Section 1 — The Hero (Above the Fold)**:
   - Headline: *"You Bring the Idea. I’ll Bring the $3,000 Tool. Let’s Pull the Lever Together."*
   - Dynamic Live Counter (`🟢 [X] Ideas Submitted and Protected`) backed by `/api/stats` & Airtable sync.
   - Zero Upfront Cost CTA scrolling smoothly to the application form.
3. **Section 2 — The Reality (Open Letter)**:
   - *"Why I Built This Community"* — addressing the $3,000 tool barrier for students and builders starting out.
4. **Section 3 — The Strategy (The Slot Machine Method)**:
   - Interactive Slot Machine Lever simulator + breakdown of Iman's high-frequency testing philosophy.
5. **Section 4 — The Profit Split**:
   - **Phase 1 (The Recoup Phase)**: `50/50 Split` until the initial `$1,997 USD` tool investment is covered.
   - **Phase 2 (The Growth Phase)**: `70/30 Split` (`70%` Creator for bringing the idea & marketing / `30%` Builder for technical management & platform fees).
6. **Section 5 — IP Protection**:
   - Instant Tracking (`ID-001`, `ID-002`, ...), Immediate Validation, and Signed PDF IP Ownership Agreement generated on submission.
7. **Section 6 — Validated Application Form & Automated Backend**:
   - Enforces required fields, valid email format, `https://` URL requirement for Traffic Source, minimum 150 characters for *The Core Idea* with live progress bar, and mandatory agreement checkbox.
   - Automatically generates a downloadable **Signed PDF IP Ownership Agreement** (`GET /api/agreement/:uniqueId`), increments the live counter, and supports optional Airtable, Zapier/Make webhook, and Gmail (`leveragemonetise@gmail.com`) delivery.

## Running Locally

```bash
npm install
npm start
```

Server runs on `http://localhost:3000` (or `PORT` specified in `.env`).
