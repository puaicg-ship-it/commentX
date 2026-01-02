# X AI Reply - Smart Reply Assistant for X

A Tampermonkey userscript that uses AI to generate intelligent replies for X (Twitter) posts.

## ✨ Features

### 🤖 AI Reply Generation
- Multiple AI models: Claude, GPT, Gemini series
- Custom API endpoint support (compatible with third-party proxies)
- Generate multiple candidate replies at once
- **Streaming mode**: Real-time display as generation progresses (optional)
- Real-time execution log showing progress

### 📡 Channel Management (New)
- **Multi-channel config**: Save multiple API configurations
- **Quick switch**: Switch between channels instantly
- **Auto-save**: Remember channel name, URL, key, model
- **Simplified settings**: Auto-detect protocol from model name

### 🖼️ Image Understanding
- Auto-extract images from tweets
- Support vision models (GPT-4o, Claude 3, Gemini)
- Generate replies based on image content
- Auto-fallback to text-only if vision not supported

### ⚙️ Flexible Configuration
- **Reply count**: 1/2/3/5 replies
- **Reply length**: Short/Medium/Long
- **Reply style**: Engaging, Humorous, Professional, Sharp, Warm
- **Reply strategy**: Default, Agree, Unique view, Balanced, Challenge
- **Language**: Auto-detect, Chinese, English, Japanese, Korean
- Custom styles and strategies support
- Auto-remember last settings

### 📊 Comment Analysis
- Fetch popular replies from comment section
- AI analysis of main opinions and sentiment
- Real-time log showing analysis process
- Generate replies matching discussion atmosphere

### 🌐 Smart Translation
- Non-Chinese replies include Chinese translation
- Translation generated with reply (no extra API call)
- Chinese for reading, original text for posting

### 📜 History
- Three-tab layout: Settings | Results | History
- Auto-save generation history (with translations)
- View previous replies when reopening panel
- Keep up to 50 tweet records

### 💫 UI Experience
- Gradient button design
- Animated loading effects
- Real-time execution log panel
- **Retry button**: Retry on generation failure

## 📦 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Install the script or manually add `x_ai_reply.user.js`
3. Refresh X.com

## ⚙️ Configuration

1. Click "⚙️ AI Reply Settings" in Tampermonkey menu
2. **Channel Management**:
   - Enter channel name (e.g., "Claude Official")
   - Enter API URL and key
   - Select model
   - Click "+ New" to save channel
3. **Switch channels**: Select from dropdown
4. Save settings

## 🎯 Usage

1. Browse X.com posts
2. Click "🤖 AI" button below the tweet
3. In settings panel:
   - Select reply count, length, style
   - (Optional) Enable "Stream" for real-time display
   - (Optional) Click "📊 Analyze Comments"
   - Select reply strategy
4. Click "✨ Generate Replies"
5. Check execution log for progress
6. Select a reply, auto-fills into reply box

## 📄 License

MIT License
