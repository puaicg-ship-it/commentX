# X AI Reply - Smart Reply Assistant for X (Twitter)

A Tampermonkey userscript that uses AI to generate intelligent replies for X (Twitter) posts.

## ✨ Features

### 🤖 AI Reply Generation
- Multiple AI providers: OpenAI, Anthropic Claude, Google Gemini
- Custom API endpoint support (compatible with proxies)
- Generate multiple reply candidates at once

### ⚙️ Flexible Configuration
- **Reply Count**: 1/2/3/5 replies
- **Reply Length**: Short/Medium/Long
- **Reply Style**: Engaging, Humorous, Professional, Sharp, Warm
- **Reply Strategy**: Default, Agree, New Perspective, Balanced, Challenge
- **Language**: Auto-detect, Chinese, English, Japanese, Korean
- Custom style and strategy support with add/delete

### 📊 Comment Analysis
- Scrape top replies from tweet comment section
- AI analysis of main viewpoints and sentiment
- Generate context-aware replies based on discussion

### 🌐 Auto Translation
- Auto-detect non-Chinese replies and translate
- Parallel translation for fast results

### 📜 History
- Auto-save generated replies per tweet
- View history when reopening panel
- Up to 50 tweet records cached

### 💾 Settings Persistence
- Remember last used settings
- Learn from user edits to improve style

## 📦 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click to install script or manually add `x_ai_reply.user.js`
3. Refresh X.com

## ⚙️ Configuration

1. Click "⚙️ AI Reply Settings" in Tampermonkey menu
2. Select AI provider (OpenAI/Anthropic/Gemini)
3. Enter API key
4. Choose model
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
