# Agent chat scroll regression

Start a local development server, then run:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3107
node scripts/verify-agent-scroll.mjs http://127.0.0.1:3107
```

The script uses Playwright with the installed Microsoft Edge browser and a temporary signed test cookie. All browser API requests are fulfilled with fixtures: 50 conversations, 24 long messages, and an active interview. It does not create accounts or modify application data. It accepts localhost URLs only and reads the local JWT secret without printing it.

At 1920×1080, 1280×720, 1280×600, and 390×844, it checks that the document fits the viewport, the composer stays visible and stationary, and messages scroll internally. It also requires both HTML and body to lock outer scrolling while the Agent workspace is active. On desktop it checks that the history rail scrolls independently. Screenshots are saved under the ignored `.private` directory.

The original failure produced a 2134px document at desktop sizes; scrolling moved the composer by 1054–1534px. The corrected workspace matches the viewport height and keeps the composer stationary.
