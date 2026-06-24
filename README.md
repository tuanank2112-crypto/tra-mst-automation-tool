# Tra MST Automation Tool

Chrome Extension + Node.js license server for automating Vietnamese business tax-code lookup workflows.

> This repository is a cleaned public version for portfolio/recruitment review. Runtime secrets, real activation data, and private deployment endpoints are intentionally removed.

## 1. Problem

In audit, accounting, and business-data workflows, users often need to check many Vietnamese tax codes manually on the official invoice/tax lookup website. This process can take hours when the input file contains many rows.

This tool automates the repetitive lookup process:

- Import an Excel file containing tax codes.
- Open the official lookup page.
- Fill in tax code and date automatically.
- Trigger the search action.
- Extract company name and status.
- Export the final result back to Excel.

The project was built as a practical business automation tool to reduce manual checking time and make the workflow easier to repeat.

## 2. Key Features

- Chrome Extension built with Manifest V3.
- Excel import/export using SheetJS.
- Automated browser interaction on the official lookup page.
- Batch tax-code processing.
- Result extraction: company name and invoice/tax status.
- Local progress handling with Chrome storage.
- Simple password/license activation flow.
- Node.js/Express license server with password rotation.
- Optional Telegram notification when password is rotated.

## 3. Tech Stack

| Area | Technologies |
|---|---|
| Browser automation | Chrome Extension, Manifest V3, JavaScript |
| Data processing | Excel, SheetJS/XLSX |
| Backend | Node.js, Express.js |
| Storage | JSON runtime state, Chrome local storage |
| Deployment-ready | VPS / HTTPS server compatible |
| Workflow type | Business automation, data checking, repetitive-task automation |

## 4. Repository Structure

```text
tra-mst-automation-tool/
├── extension/
│   ├── background.js
│   ├── content.js
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── libs/
│       └── xlsx.full.min.js
├── server/
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   └── db.example.json
├── .env.example
├── .gitignore
└── README.md
```

## 5. Security / Public Repo Notes

Before using this project in a real environment:

1. Do **not** commit `server/db.json`.
2. Do **not** commit real API keys, admin keys, Telegram bot tokens, or private endpoints.
3. Replace the placeholder in `extension/popup.js`:

```js
const LICENSE_VERIFY_URL = "YOUR_LICENSE_VERIFY_ENDPOINT";
```

with your own deployed license endpoint, for example:

```js
const LICENSE_VERIFY_URL = "https://your-domain.com/verify";
```

4. If your endpoint domain is not already covered, update `host_permissions` in `extension/manifest.json`.

## 6. Setup: License Server

Requirements:

- Node.js 18+
- npm

```bash
cd server
npm install
cp db.example.json db.json
npm start
```

Health check:

```text
GET http://localhost:3000/health
```

Expected response:

```json
{ "ok": true }
```

### Optional environment variables

```bash
PORT=3000
ADMIN_KEY=CHANGE_ME_ADMIN_KEY
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are optional. If they are not set, the rotated password will be printed to the server console.

## 7. Setup: Chrome Extension

1. Open `extension/popup.js`.
2. Replace:

```js
const LICENSE_VERIFY_URL = "YOUR_LICENSE_VERIFY_ENDPOINT";
```

with your real license endpoint.

3. Open Chrome and go to:

```text
chrome://extensions
```

4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `extension/` folder.

## 8. How It Works

```text
Excel input
   ↓
Chrome Extension reads rows
   ↓
Open official lookup website
   ↓
Auto-fill tax code and date
   ↓
Run search
   ↓
Extract result from page
   ↓
Export result to Excel
```

License flow:

```text
User enters password
   ↓
Extension sends verify request
   ↓
Server validates current password
   ↓
Server rotates password
   ↓
Server stores activation log
   ↓
Extension unlocks current device
```

## 9. Demo

A private video demo is available upon request.

The demo shows the real automation flow: importing an Excel file, running tax-code lookup, extracting results, and exporting the processed file.

## 10. Portfolio Context

This project was created as a real automation tool for a business workflow, not as a static demo. It demonstrates:

- Breaking down a manual business process into automatable steps.
- Building a browser extension for repetitive web actions.
- Handling Excel-based input/output.
- Creating a lightweight backend service for activation control.
- Debugging real workflow issues on a live third-party website.

## 11. Disclaimer

This project is for educational, portfolio, and internal automation demonstration purposes. When using automation with third-party or government websites, users are responsible for following the applicable terms of use, rate limits, and legal requirements.
