# LinkedIn Job Copy Agent

LinkedIn Job Copy Agent is a lightweight Chrome extension that adds a `Copy job` menu to LinkedIn job listing pages. It extracts the job title, company, location, salary, work mode, employment type, posting metadata, source URL, and job description, then formats that information for clipboard use or opens it directly in AI tools.

The extension is designed for job seekers who want a clean, repeatable way to bring LinkedIn job specs into ChatGPT, Codex, Claude, or Claude Code without manually selecting and cleaning page text.

## Features

- Injects a LinkedIn-style `Copy job` button into job listing pages.
- Extracts structured job data from the top card and `About the job` section.
- Copies raw JSON for downstream automation.
- Copies a readable Markdown job brief.
- Opens vendor-specific URLs with an encoded prompt and job spec.
- Keeps a clipboard fallback when opening an external destination.
- Uses a fixed popover so the menu is not clipped by LinkedIn cards.
- Includes a local fixture page for quick UI and extraction checks.

## Menu Options

| Option | Action |
| --- | --- |
| `Copy raw output` | Copies structured JSON with metadata and description. |
| `Copy Markdown` | Copies a readable Markdown brief. |
| `Open in ChatGPT` | Opens `https://chat.openai.com/?q=...`. |
| `Open in Codex` | Opens `codex://new?prompt=...`. |
| `Open in Claude Code` | Opens `claude-cli://open?q=...`. |
| `Open in Claude` | Opens `https://claude.ai/new?q=...`. |

Vendor actions use this prompt prefix:

```text
Read and evaluate this job spec so I can ask questions about it
```

The extracted Markdown job spec is appended to that prefix and URL-encoded into the destination.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder.
6. Open a LinkedIn job listing page under `linkedin.com/jobs/`.

## What Gets Extracted

- Title
- Company
- Location
- Salary
- Workplace type
- Employment type
- Posted date
- Applicant count
- Apply type
- Canonical LinkedIn URL
- LinkedIn job ID
- Full job description text

LinkedIn changes its markup frequently, so the extractor uses a mix of stable selectors and visible-page heuristics.

## Privacy

This extension does not send job data to a background server. It runs as a content script on LinkedIn job pages, writes selected output to your clipboard, and opens destination URLs only when you choose a menu item.

Opening ChatGPT, Codex, Claude, or Claude Code passes the encoded job spec to that destination through the URL you clicked.

## Development

There is no build step. The extension is plain Manifest V3 JavaScript and CSS.

Useful checks:

```sh
node --check src/content.js
python3 -m json.tool manifest.json >/dev/null
```

Run the local fixture:

```sh
python3 -m http.server 8877 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8877/test-fixtures/linkedin-job.html
```

## Project Structure

```text
manifest.json
src/
  content.js
  content.css
test-fixtures/
  linkedin-job.html
```

## Custom Destinations

Destination URL prefixes live in `src/content.js` under `VENDOR_TARGETS`.

## Troubleshooting

If the button does not appear after changing files:

1. Open `chrome://extensions`.
2. Click the reload icon on **LinkedIn Job Copy Agent**.
3. Reload the LinkedIn job page.

Chrome does not always re-run updated unpacked content scripts on already-open pages until both the extension and the page are reloaded.
