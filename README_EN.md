# X AI Reply - Smart Reply Assistant for X (Twitter)

A Tampermonkey userscript that uses AI to generate intelligent replies for X (Twitter) posts.

## ✨ Features

### 🤖 AI Reply Generation
- Multiple AI providers: OpenAI, Anthropic Claude, Google Gemini
- Custom API endpoint support (compatible with proxies)
- Generate multiple reply candidates at once

### 🖼️ Image Understanding
- Auto-extract images from tweets
- Vision model support (GPT-4o, Claude 3, Gemini)
- Generate context-aware replies based on images
- Auto-fallback to text-only if vision not supported

### ⚙️ Flexible Configuration
- **Reply Count**: 1/2/3/5 replies
- **Reply Length**: Short/Medium/Long
- **Reply Style**: Engaging, Humorous, Professional, Sharp, Warm
- **Reply Strategy**: Default, Agree, New Perspective, Balanced, Challenge
- **Language**: Auto-detect, Chinese, English, Japanese, Korean
- Custom style and strategy with add/delete
- Settings persistence across sessions

### 📊 Comment Analysis
- Scrape top replies from tweet comments
- AI analysis of main viewpoints and sentiment
- Real-time log display during analysis
- Generate context-aware replies based on discussion

### 🌐 Smart Translation
- Non-Chinese replies include Chinese translation
- Translation generated with reply (no extra API call)
- Chinese is for reading only; original text is sent

### 📜 History
- Three-tab layout: Settings | Results | History
- Auto-save generated replies per tweet
- View history when reopening panel
- Up to 50 tweet records cached

## 📦 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click to install script or manually add `x_ai_reply.user.js`
3. Refresh X.com

## ⚙️ Configuration

1. Click "⚙️ AI Reply Settings" in Tampermonkey menu
2. Select AI provider (OpenAI/Anthropic/Gemini)
3. Enter API key
4. Choose model (vision-capable models like GPT-4o recommended)
5. Save settings

## 🎯 Usage

1. Browse X.com posts
2. Click the "🤖 AI" button below any tweet
3. In the settings panel:
   - Choose reply count, length, style
   - (Optional) Click "📊 Analyze Comments"
   - Select reply strategy
4. Click "✨ Generate Replies"
5. Select a reply to auto-fill into the reply box

## 📄 License

MIT License
