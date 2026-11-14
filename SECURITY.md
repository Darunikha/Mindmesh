# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: open this repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting). Include:

- what the problem is and where it is,
- steps to reproduce it,
- the impact you think it has.

You will get a reply as soon as I can manage it. This is a personal project, so I can't promise fixed response times or offer rewards, but I take reports seriously and will credit you if you'd like.

## What is in scope

Mindmesh holds people's private notes, documents and AI conversations, so the most important issues are anything that:

- lets one user read, change or delete another user's data (notes, files, search results, conversations, flashcards, graph),
- bypasses sign-in, token checks or session revocation,
- exposes API keys or secrets,
- lets a crafted upload, saved link or note run code, read local files or reach internal networks (including server-side request forgery),
- allows script injection into the web app.

## What the project already does

A summary of the existing protections is in the **Security** section of the [README](README.md): hashed passwords, short-lived tokens with rotating refresh cookies and reuse detection, per-user scoping on every query, upload checks, private-network blocking for saved links, rate limiting and input validation.

## Supported versions

Only the latest code on the `main` branch is supported.

## Running your own copy

If you deploy Mindmesh yourself:

- keep `server/.env` private and never commit it,
- use long random values for both JWT secrets,
- serve over HTTPS and set `NODE_ENV=production`,
- keep dependencies up to date (`npm audit --omit=dev`).
