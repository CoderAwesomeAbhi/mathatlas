# MathAtlas — Deployment Guide

## Project Structure
```
mathatlas/
├── index.html        # Main frontend
├── api/
│   └── gemini.js     # Serverless function (Gemini API proxy)
├── vercel.json       # Vercel config
└── README.md
```

## Deploy to Vercel (5 minutes)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Push to GitHub
Create a new repo at github.com, then:
```bash
git init
git add .
git commit -m "Initial MathAtlas deployment"
git remote add origin https://github.com/YOUR_USERNAME/mathatlas.git
git push -u origin main
```

### 3. Deploy
```bash
vercel
```
Follow the prompts. Choose "No" for existing project.

### 4. Set your Gemini API key (IMPORTANT — never hardcode it)
```bash
vercel env add GEMINI_API_KEY
```
Paste your key when prompted. Then redeploy:
```bash
vercel --prod
```

### 5. Custom domain (optional)
In Vercel dashboard → your project → Settings → Domains
Add `mathatlas.com` or any domain you own.

Or use the free Vercel subdomain: `mathatlas.vercel.app`

## Local Development
```bash
npm install -g vercel
vercel dev
```
This runs both the HTML and the `/api/gemini` function locally.
Set your key in a `.env.local` file:
```
GEMINI_API_KEY=your_key_here
```
Never commit `.env.local` to git.

## Notes
- The Gemini API key is stored as a Vercel environment variable — never in frontend code
- Free tier: Gemini 2.0 Flash has a generous free quota
- The `/api/gemini` route is a serverless function that proxies requests server-side
