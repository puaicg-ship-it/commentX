// ==UserScript==
// @name         X.com AI Reply
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add an 'AI Reply' button to X.com tweets, generating replies using an LLM.
// @author       AntiGravity
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================================
     * MODULE 1: CONFIGURATION & CONSTANTS
     * =========================================================================
     * Default settings, API configuration, and global state
     * ========================================================================= */

    // --- Default Configuration ---
    const DEFAULT_CONFIG = {
        requestFormat: "openai", // 'openai', 'anthropic', 'gemini'
        apiBaseUrl: "https://api.openai.com",
        apiKey: "",
        model: "gpt-3.5-turbo",
        modelList: [],
        persona: "幽默风趣",
        autoSend: false
    };

    let config = { ...DEFAULT_CONFIG, ...GM_getValue('config', {}) };

    /* =========================================================================
     * MODULE 2: CHANNEL MANAGEMENT
     * =========================================================================
     * Save, load, delete, and switch between API channels
     * ========================================================================= */

    function getSavedChannels() {
        return GM_getValue('savedChannels', []);
    }

    function getActiveChannelId() {
        return GM_getValue('activeChannelId', null);
    }

    function saveChannel(channel) {
        const channels = getSavedChannels();
        const existingIndex = channels.findIndex(c => c.id === channel.id);
        if (existingIndex >= 0) {
            channels[existingIndex] = channel;
        } else {
            channels.push(channel);
        }
        GM_setValue('savedChannels', channels);
        return channel;
    }

    function deleteChannel(id) {
        const channels = getSavedChannels().filter(c => c.id !== id);
        GM_setValue('savedChannels', channels);
        // If deleted active channel, clear it
        if (getActiveChannelId() === id) {
            GM_setValue('activeChannelId', null);
        }
    }

    function setActiveChannel(id) {
        GM_setValue('activeChannelId', id);
        const channels = getSavedChannels();
        const channel = channels.find(c => c.id === id);
        if (channel) {
            config = { ...DEFAULT_CONFIG, ...channel };
            GM_setValue('config', config);
        }
    }

    function generateChannelId() {
        return 'channel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /* =========================================================================
     * MODULE 3: MODEL CONFIGURATION
     * =========================================================================
     * Model lists, icons, and provider detection utilities
     * ========================================================================= */

    // --- Icons ---
    const ROBOT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-1plcrui r-lrvibr r-1xvli5t r-1hdv0qi"><g><path d="M12 2a2 2 0 0 1 2 2v2h2a2 2 0 0 1 2 2v2.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5V17a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5V6a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zm0 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3.5-1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor"></path></g></svg>`;

    // --- Model Lists ---
    // Local proxy models
    const LOCAL_MODELS = {
        openai: [
            "gpt-4o",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo"
        ],
        anthropic: [
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ],
        gemini: [
            "gemini-pro",
            "gemini-pro-vision"
        ]
    };

    // Online API models (auto-detect provider from model name)
    const ONLINE_MODELS = {
        anthropic: [
            "claude-sonnet-4-5-20250929",
            "claude-opus-4-5-20251101",
            "claude-haiku-4-5-20251001",
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514",
            "claude-opus-4-1-20250805",
            "claude-3-7-sonnet-20250219",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022"
        ],
        openai: [
            "gpt-5",
            "gpt-5-codex",
            "gpt-5-codex-high",
            "gpt-5-codex-medium-medium",
            "gpt-5.1-codex",
            "gpt-4o"
        ],
        gemini: [
            "gemini-3-pro-preview"
        ]
    };

    // Flatten online models for dropdown
    const ALL_ONLINE_MODELS = [
        ...ONLINE_MODELS.anthropic,
        ...ONLINE_MODELS.openai,
        ...ONLINE_MODELS.gemini
    ];

    // Auto-detect provider from model name (for saving config)
    function detectProviderFromModel(model) {
        if (!model) return 'openai';
        const m = model.toLowerCase();
        if (m.includes('claude')) return 'anthropic';
        if (m.includes('gemini')) return 'gemini';
        return 'openai';  // Default to OpenAI compatible
    }

    // Get request format based on model name
    // All use standard API formats - proxy handles the CLI compatibility
    function getRequestFormat(model) {
        const m = (model || '').toLowerCase();
        if (m.includes('claude')) {
            return 'anthropic';  // /v1/messages
        }
        if (m.includes('gemini')) {
            return 'gemini';  // /v1beta/models/...
        }
        return 'openai';  // /v1/chat/completions
    }

    // Keep PROVIDER_MODELS for backward compatibility
    const PROVIDER_MODELS = LOCAL_MODELS;

    /* =========================================================================
     * MODULE 4: SETTINGS MODAL
     * =========================================================================
     * Configuration UI for channels, models, API keys, and preferences
     * ========================================================================= */

    function createSettingsModal() {
        if (document.getElementById('x-ai-reply-settings')) return;

        const modal = document.createElement('div');
        modal.id = 'x-ai-reply-settings';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #000;
            border: 1px solid #333;
            border-radius: 16px;
            padding: 20px;
            z-index: 9999;
            color: #fff;
            width: 420px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 30px rgba(0,0,0,0.5);
            font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        `;

        // Build model options for current provider
        function buildModelOptions(provider, selectedModel) {
            const models = PROVIDER_MODELS[provider] || [];
            let options = models.map(m =>
                `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`
            ).join('');
            // Add custom option
            const isCustom = !models.includes(selectedModel) && selectedModel;
            options += `<option value="__custom__" ${isCustom ? 'selected' : ''}>自定义模型...</option>`;
            return options;
        }

        // Build channel options
        function buildChannelOptions() {
            const channels = getSavedChannels();
            const activeId = getActiveChannelId();
            if (channels.length === 0) {
                return '<option value="">-- 无保存渠道 --</option>';
            }
            return channels.map(c => {
                const typeIcon = c.channelType === 'local' ? '🖥️' : '☁️';
                return `<option value="${c.id}" ${c.id === activeId ? 'selected' : ''}>${typeIcon} ${c.name}</option>`;
            }).join('');
        }

        modal.innerHTML = `
            <h2 style="margin-top: 0; margin-bottom: 20px; font-size: 20px;">AI Reply Settings</h2>
            
            <!-- Channel Management -->
            <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                    <label style="font-size: 12px; color: #888; margin: 0;">📡 渠道</label>
                </div>
                <div style="display: flex; gap: 8px;">
                    <select id="ai-channel-select" style="flex: 1; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 12px;">
                        ${buildChannelOptions()}
                    </select>
                    <button id="ai-channel-add" style="padding: 8px 12px; background: #1d9bf0; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 新建</button>
                    <button id="ai-channel-delete" style="padding: 8px 12px; background: #333; color: #888; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️</button>
                </div>
                <input type="text" id="ai-channel-name" placeholder="渠道名称 (可选)" value="${getSavedChannels().find(c => c.id === getActiveChannelId())?.name || ''}" style="width: 100%; padding: 8px; margin-top: 10px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 12px;">
            </div>
            
            <label style="display:block; margin-bottom: 5px;">API Base URL <span style="color:#888;font-size:11px;">(不含 /v1 后缀)</span></label>
            <input type="text" id="ai-api-url" value="${config.apiBaseUrl}" placeholder="如: https://api.openai.com" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">

            <label style="display:block; margin-bottom: 5px;">API Key</label>
            <input type="password" id="ai-api-key" value="${config.apiKey}" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">

            <!-- Request Format Selector -->
            <label style="display:block; margin-bottom: 5px;">请求格式 <span style="color:#888;font-size:11px;">(API 协议)</span></label>
            <select id="ai-request-format" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">
                <option value="openai" ${config.requestFormat === 'openai' ? 'selected' : ''}>OpenAI (/v1/chat/completions)</option>
                <option value="anthropic" ${config.requestFormat === 'anthropic' ? 'selected' : ''}>Anthropic (/v1/messages)</option>
                <option value="gemini" ${config.requestFormat === 'gemini' ? 'selected' : ''}>Gemini (/v1beta/models/...)</option>
            </select>

            <!-- Model List Editor -->
            <label style="display:block; margin-bottom: 5px;">可用模型列表 <span style="color:#888;font-size:11px;">(一行一个)</span></label>
            <textarea id="ai-model-list" rows="4" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-family: monospace; font-size: 11px;">${(config.modelList || []).join('\n')}</textarea>

            <!-- Model selector -->
            <label style="display:block; margin-bottom: 5px;">当前模型</label>
            <select id="ai-model-select" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">
                ${(config.modelList || ALL_ONLINE_MODELS).map(m => `<option value="${m}" ${m === config.model ? 'selected' : ''}>${m}</option>`).join('') + '<option value="__custom__">自定义模型...</option>'}
            </select>
            <input type="text" id="ai-model-custom" value="${config.model}" placeholder="输入自定义模型名称" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; display: none;">

            <label style="display:block; margin-bottom: 5px;">Persona / Style <span style="color:#888;font-size:11px;">(回复风格)</span></label>
            <textarea id="ai-persona" rows="3" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">${config.persona}</textarea>

            <label style="display:flex; align-items:center; margin-bottom: 15px;">
                <input type="checkbox" id="ai-autosend" ${config.autoSend ? 'checked' : ''} style="margin-right: 10px;">
                生成后自动发送
            </label>

            <div style="padding: 12px; background: #111; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 13px; color: #888; margin-bottom: 8px;">📚 学习记忆</div>
                <div style="font-size: 12px; color: #666;">已记录 <span id="ai-history-count">${GM_getValue('replyHistory', []).length}</span> 条历史回复用于优化生成</div>
                <button id="ai-clear-history" style="margin-top: 8px; padding: 6px 12px; background: transparent; color: #ff6b6b; border: 1px solid #ff6b6b; border-radius: 12px; font-size: 11px; cursor: pointer;">清除历史</button>
            </div>

            <!-- Domain Style Configuration -->
            <div style="padding: 12px; background: #111; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 13px; color: #888; margin-bottom: 8px;">🏷️ 领域回复风格</div>
                <div style="font-size: 11px; color: #666; margin-bottom: 10px;">为不同领域的推文配置默认回复风格</div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select id="ai-domain-select" style="flex: 1; padding: 6px 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 12px;">
                        ${DOMAIN_CATEGORIES.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                    <div>
                        <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">风格</label>
                        <select id="ai-domain-style" style="width: 100%; padding: 4px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 11px;">
                            ${getAllStyles().map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">策略</label>
                        <select id="ai-domain-strategy" style="width: 100%; padding: 4px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 11px;">
                            ${getAllStrategies().map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">长度</label>
                        <select id="ai-domain-length" style="width: 100%; padding: 4px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 11px;">
                            <option value="short">短</option>
                            <option value="medium">中</option>
                            <option value="long">长</option>
                        </select>
                    </div>
                </div>
                
                <div id="ai-domain-summary-area" style="margin-top: 8px; padding: 8px; background: #1a1a1a; border-radius: 6px; display: none;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">📝 风格总结 (<span id="ai-domain-history-count">0</span> 条历史)</div>
                    <div id="ai-domain-summary-text" style="font-size: 11px; color: #4ade80; line-height: 1.4;"></div>
                </div>
                
                <div style="display: flex; gap: 6px; margin-top: 8px;">
                    <button id="ai-domain-save" style="flex: 1; padding: 6px; background: #1d9bf0; color: #fff; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">保存领域设置</button>
                    <button id="ai-domain-reset" style="padding: 6px 10px; background: transparent; color: #888; border: 1px solid #444; border-radius: 4px; font-size: 11px; cursor: pointer;">重置</button>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="ai-cancel" style="padding: 8px 16px; background: transparent; color: #fff; border: 1px solid #444; border-radius: 20px; cursor: pointer;">取消</button>
                <button id="ai-save" style="padding: 8px 16px; background: #1d9bf0; color: #fff; border: none; border-radius: 20px; cursor: pointer; font-weight: bold;">保存</button>
            </div>
        `;

        document.body.appendChild(modal);

        // Channel management handlers
        const channelSelect = document.getElementById('ai-channel-select');
        const channelNameInput = document.getElementById('ai-channel-name');
        const channelAddBtn = document.getElementById('ai-channel-add');
        const channelDeleteBtn = document.getElementById('ai-channel-delete');

        // Switch channel
        channelSelect.onchange = () => {
            const channelId = channelSelect.value;
            if (channelId) {
                setActiveChannel(channelId);
                // Reload modal to show new config
                modal.remove();
                createSettingsModal();
            }
        };

        // Add new channel
        channelAddBtn.onclick = () => {
            const name = channelNameInput.value.trim() || '新渠道 ' + (getSavedChannels().length + 1);
            const modelListText = document.getElementById('ai-model-list').value;
            const modelList = modelListText.split('\n').map(m => m.trim()).filter(m => m.length > 0);
            const model = document.getElementById('ai-model-custom').value || document.getElementById('ai-model-select').value;

            const newChannel = {
                id: generateChannelId(),
                name: name,
                modelList: modelList,
                requestFormat: document.getElementById('ai-request-format').value,
                apiBaseUrl: document.getElementById('ai-api-url').value,
                apiKey: document.getElementById('ai-api-key').value,
                model: model
            };
            saveChannel(newChannel);
            setActiveChannel(newChannel.id);
            // Reload modal
            modal.remove();
            createSettingsModal();
            alert(`渠道 "${name}" 已创建！`);
        };

        // Delete current channel
        channelDeleteBtn.onclick = () => {
            const channelId = channelSelect.value;
            if (!channelId) {
                alert('没有选择渠道');
                return;
            }
            const channel = getSavedChannels().find(c => c.id === channelId);
            if (confirm(`确定要删除渠道 "${channel?.name}" 吗？`)) {
                deleteChannel(channelId);
                // Reload modal
                modal.remove();
                createSettingsModal();
            }
        };

        const modelSelect = document.getElementById('ai-model-select');
        const modelCustom = document.getElementById('ai-model-custom');

        // Show/hide custom input based on selection
        function updateCustomInput() {
            if (modelSelect.value === '__custom__') {
                modelCustom.style.display = 'block';
                modelCustom.focus();
            } else {
                modelCustom.style.display = 'none';
                modelCustom.value = modelSelect.value;
            }
        }

        // Sync model dropdown when model list textarea changes
        const modelListTextarea = document.getElementById('ai-model-list');
        modelListTextarea.onchange = () => {
            const models = modelListTextarea.value.split('\n').map(m => m.trim()).filter(m => m.length > 0);
            modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('') + '<option value="__custom__">自定义模型...</option>';
            modelCustom.style.display = 'none';
        };

        modelSelect.onchange = updateCustomInput;

        // Clear history button
        document.getElementById('ai-clear-history').onclick = () => {
            if (confirm('确定要清除所有学习历史吗？')) {
                GM_setValue('replyHistory', []);
                document.getElementById('ai-history-count').textContent = '0';
                alert('历史已清除');
            }
        };

        // --- Domain Style Configuration Handlers ---
        const domainSelect = document.getElementById('ai-domain-select');
        const domainStyleSelect = document.getElementById('ai-domain-style');
        const domainStrategySelect = document.getElementById('ai-domain-strategy');
        const domainLengthSelect = document.getElementById('ai-domain-length');
        const domainSaveBtn = document.getElementById('ai-domain-save');
        const domainResetBtn = document.getElementById('ai-domain-reset');
        const domainSummaryArea = document.getElementById('ai-domain-summary-area');
        const domainHistoryCount = document.getElementById('ai-domain-history-count');
        const domainSummaryText = document.getElementById('ai-domain-summary-text');

        // Load current domain settings and summary status when domain changes
        const loadDomainSettings = () => {
            const domainId = domainSelect.value;
            const style = getDomainStyle(domainId);
            domainStyleSelect.value = style.style || 'engage';
            domainStrategySelect.value = style.strategy || 'default';
            domainLengthSelect.value = style.length || 'medium';

            // Update summary display
            const status = getSummaryStatus(domainId);
            domainHistoryCount.textContent = status.historyCount;
            if (status.hasSummary) {
                domainSummaryArea.style.display = 'block';
                domainSummaryText.textContent = status.summary;
            } else {
                domainSummaryArea.style.display = status.historyCount > 0 ? 'block' : 'none';
                domainSummaryText.textContent = status.historyCount > 0 ? '暂无总结（需 3+ 条编辑过的回复）' : '';
                domainSummaryText.style.color = '#888';
            }
        };

        domainSelect.onchange = loadDomainSettings;
        loadDomainSettings(); // Load initial

        // Save domain style
        domainSaveBtn.onclick = () => {
            const domainId = domainSelect.value;
            saveDomainStyle(domainId, {
                style: domainStyleSelect.value,
                strategy: domainStrategySelect.value,
                length: domainLengthSelect.value
            });
            alert(`已保存 "${getDomainById(domainId).name}" 领域的风格设置`);
        };

        // Reset domain style to default
        domainResetBtn.onclick = () => {
            const domainId = domainSelect.value;
            if (confirm(`确定要重置 "${getDomainById(domainId).name}" 的风格设置为默认值吗？`)) {
                resetDomainStyle(domainId);
                loadDomainSettings();
                alert('已重置为默认设置');
            }
        };

        document.getElementById('ai-cancel').onclick = () => modal.remove();
        document.getElementById('ai-save').onclick = () => {
            // Save model list from textarea
            const modelListText = document.getElementById('ai-model-list').value;
            config.modelList = modelListText.split('\n').map(m => m.trim()).filter(m => m.length > 0);

            // Save request format
            config.requestFormat = document.getElementById('ai-request-format').value;

            config.apiBaseUrl = document.getElementById('ai-api-url').value;
            config.apiKey = document.getElementById('ai-api-key').value;
            // Get model from custom input if custom selected, otherwise from dropdown
            config.model = modelSelect.value === '__custom__' ? modelCustom.value : modelSelect.value;

            config.persona = document.getElementById('ai-persona').value;
            config.autoSend = document.getElementById('ai-autosend').checked;

            GM_setValue('config', config);

            // Also update active channel if one is selected
            const activeId = getActiveChannelId();
            if (activeId) {
                const updatedChannel = {
                    id: activeId,
                    name: channelNameInput.value.trim() || getSavedChannels().find(c => c.id === activeId)?.name || '未命名',
                    modelList: config.modelList,
                    requestFormat: config.requestFormat,
                    apiBaseUrl: config.apiBaseUrl,
                    apiKey: config.apiKey,
                    model: config.model
                };
                saveChannel(updatedChannel);
            }

            modal.remove();
            alert('设置已保存!');
        };
    }

    GM_registerMenuCommand("Settings", createSettingsModal);

    /* =========================================================================
     * MODULE 5: TWEET EXTRACTION
     * =========================================================================
     * Extract text and images from tweets
     * ========================================================================= */

    function getTweetText(articleElement) {
        // This is a heuristic. Tweet text is usually in a div with lang attribute or specific props.
        // We look for the main text container.
        const textElement = articleElement.querySelector('div[data-testid="tweetText"]');
        return textElement ? textElement.innerText : "";
    }

    function getTweetImages(articleElement) {
        const images = [];
        // Find tweet photos
        const photoContainer = articleElement.querySelector('div[data-testid="tweetPhoto"]');
        if (photoContainer) {
            const imgs = photoContainer.querySelectorAll('img');
            imgs.forEach(img => {
                const src = img.src;
                // Filter out profile pics and small images, get actual tweet images
                if (src && src.includes('pbs.twimg.com/media')) {
                    // Get higher quality version
                    const highQualitySrc = src.replace(/&name=\w+/, '&name=medium');
                    images.push(highQualitySrc);
                }
            });
        }
        // Also check for card images
        const cardImg = articleElement.querySelector('div[data-testid="card.wrapper"] img');
        if (cardImg && cardImg.src && cardImg.src.includes('pbs.twimg.com')) {
            images.push(cardImg.src);
        }
        return images.slice(0, 4); // Max 4 images
    }

    // Convert image URL to base64 (for Anthropic)
    async function imageUrlToBase64(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function (response) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = reader.result.split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(response.response);
                },
                onerror: () => resolve(null)
            });
        });
    }

    /* =========================================================================
     * MODULE 6: STYLES & CSS
     * =========================================================================
     * Inject CSS styles for loading animations, panels, and buttons
     * ========================================================================= */

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .x-ai-loading {
                padding: 12px;
                color: #1d9bf0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: rgba(29, 155, 240, 0.1);
                border-radius: 12px;
                margin-top: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                animation: x-ai-fade-in 0.2s;
            }
            @keyframes x-ai-fade-in {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .x-ai-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid #1d9bf0;
                border-top-color: transparent;
                border-radius: 50%;
                animation: x-ai-spin 1s linear infinite;
            }
            @keyframes x-ai-spin {
                to { transform: rotate(360deg); }
            }
            @keyframes x-ai-blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
            /* Options Panel */
            .x-ai-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #000;
                border: 1px solid #333;
                border-radius: 16px;
                padding: 20px;
                z-index: 10000;
                color: #fff;
                width: 380px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 8px 40px rgba(0,0,0,0.6);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                animation: x-ai-fade-in 0.2s;
            }
            .x-ai-panel h3 {
                margin: 0 0 15px 0;
                font-size: 18px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .x-ai-panel label {
                display: block;
                margin-bottom: 5px;
                font-size: 13px;
                color: #888;
            }
            .x-ai-panel select, .x-ai-panel input {
                width: 100%;
                padding: 10px;
                margin-bottom: 12px;
                background: #222;
                border: 1px solid #444;
                color: #fff;
                border-radius: 8px;
                font-size: 14px;
            }
            .x-ai-panel select:focus, .x-ai-panel input:focus {
                outline: none;
                border-color: #1d9bf0;
            }
            .x-ai-btn-primary {
                width: 100%;
                padding: 12px;
                background: #1d9bf0;
                color: #fff;
                border: none;
                border-radius: 9999px;
                font-size: 15px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.2s;
            }
            .x-ai-btn-primary:hover {
                background: #1a8cd8;
            }
            .x-ai-btn-secondary {
                padding: 8px 16px;
                background: transparent;
                color: #1d9bf0;
                border: 1px solid #1d9bf0;
                border-radius: 9999px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .x-ai-btn-secondary:hover {
                background: rgba(29, 155, 240, 0.1);
            }
            .x-ai-close {
                position: absolute;
                top: 15px;
                right: 15px;
                background: none;
                border: none;
                color: #888;
                font-size: 20px;
                cursor: pointer;
            }
            .x-ai-close:hover {
                color: #fff;
            }
            /* Results Panel */
            .x-ai-results {
                margin-top: 15px;
            }
            .x-ai-reply-card {
                padding: 12px;
                background: #111;
                border: 1px solid #333;
                border-radius: 12px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .x-ai-reply-card:hover {
                border-color: #1d9bf0;
                background: #1a1a1a;
            }
            .x-ai-reply-card.selected {
                border-color: #1d9bf0;
                background: rgba(29, 155, 240, 0.1);
            }
            .x-ai-reply-text {
                font-size: 14px;
                line-height: 1.5;
                color: #e7e9ea;
            }
            .x-ai-reply-index {
                font-size: 11px;
                color: #888;
                margin-bottom: 5px;
            }
            .x-ai-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            }
            /* Chip Buttons */
            .x-ai-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            .x-ai-chip {
                padding: 6px 12px;
                background: #222;
                border: 1px solid #444;
                color: #888;
                border-radius: 9999px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .x-ai-chip:hover {
                border-color: #666;
                color: #fff;
            }
            .x-ai-chip.active {
                background: rgba(29, 155, 240, 0.15);
                border-color: #1d9bf0;
                color: #1d9bf0;
            }
        `;
        document.head.appendChild(style);
    }
    addStyles();

    /* =========================================================================
     * MODULE 7: UI COMPONENTS
     * =========================================================================
     * Loading spinner, error display, and other visual feedback
     * ========================================================================= */

    function showLoading(article) {
        const container = article.querySelector('div[role="group"]')?.parentNode; // Likely the parent of action bar
        if (!container) return null;

        const loader = document.createElement('div');
        loader.className = 'x-ai-loading';
        loader.innerHTML = '<div class="x-ai-spinner"></div><span>AI is thinking...</span>';

        // Insert after the action bar or at bottom of article
        container.appendChild(loader);
        return loader;
    }

    function removeLoading(loader) {
        if (loader) loader.remove();
    }

    function showError(article, errorMsg) {
        const container = article.querySelector('div[role="group"]')?.parentNode;
        if (!container) return;

        const existingError = container.querySelector('.x-ai-error');
        if (existingError) existingError.remove();

        const errorBox = document.createElement('div');
        errorBox.className = 'x-ai-error';
        errorBox.style.cssText = `
            padding: 12px;
            color: #ff4444;
            background: rgba(255, 68, 68, 0.1);
            border-radius: 12px;
            margin-top: 8px;
            font-family: monospace;
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 11px;
            border: 1px solid rgba(255, 68, 68, 0.3);
            position: relative;
        `;
        errorBox.innerText = `[AI Error]\n${errorMsg}`;

        // Add a close button
        const closeBtn = document.createElement('span');
        closeBtn.innerText = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 5px;
            right: 10px;
            cursor: pointer;
            font-weight: bold;
            font-size: 16px;
            color: #ff4444;
        `;
        closeBtn.onclick = (e) => { e.stopPropagation(); errorBox.remove(); };
        errorBox.appendChild(closeBtn);

        container.appendChild(errorBox);
    }

    /* =========================================================================
     * MODULE 8: REPLY CONFIGURATION
     * =========================================================================
     * Languages, styles, strategies, history, and caching
     * ========================================================================= */

    const REPLY_LANGUAGES = [
        { id: 'auto', name: '🌐 自动检测' },
        { id: 'zh', name: '🇨🇳 中文' },
        { id: 'en', name: '🇺🇸 English' },
        { id: 'ja', name: '🇯🇵 日本語' },
        { id: 'ko', name: '🇰🇷 한국어' }
    ];

    // --- Learning Memory System (Domain-Specific) ---
    const MAX_HISTORY_PER_DOMAIN = 50;
    const SUMMARY_THRESHOLD = 5; // Trigger summary every 5 new items

    // Migrate old format to new domain-specific format
    function migrateOldHistory() {
        const oldHistory = GM_getValue('replyHistory', null);
        if (oldHistory && Array.isArray(oldHistory) && oldHistory.length > 0) {
            // Migrate to 'general' domain
            let newHistory = GM_getValue('replyHistoryByDomain', {});
            if (!newHistory.general) newHistory.general = [];
            newHistory.general = [...oldHistory.slice(0, MAX_HISTORY_PER_DOMAIN), ...newHistory.general].slice(0, MAX_HISTORY_PER_DOMAIN);
            GM_setValue('replyHistoryByDomain', newHistory);
            // Clear old format
            GM_setValue('replyHistory', []);
            console.log('[X-AI-Reply] Migrated', oldHistory.length, 'history items to general domain');
        }
    }
    migrateOldHistory();

    // Domain-specific history storage
    let replyHistoryByDomain = GM_getValue('replyHistoryByDomain', {});
    let historySummaryByDomain = GM_getValue('historySummaryByDomain', {});

    function getHistoryForDomain(domain) {
        return replyHistoryByDomain[domain] || [];
    }

    function saveReplyToHistory(original, final, tweetContext, domain = 'general') {
        if (!replyHistoryByDomain[domain]) {
            replyHistoryByDomain[domain] = [];
        }

        const history = replyHistoryByDomain[domain];
        const prevLength = history.length;

        history.unshift({
            original,
            final,
            tweetContext: tweetContext.substring(0, 100),
            timestamp: Date.now()
        });

        if (history.length > MAX_HISTORY_PER_DOMAIN) {
            history.length = MAX_HISTORY_PER_DOMAIN;
        }

        replyHistoryByDomain[domain] = history;
        GM_setValue('replyHistoryByDomain', replyHistoryByDomain);

        // Check if we should trigger summary update
        const summaryData = historySummaryByDomain[domain];
        const itemsSinceSummary = history.length - (summaryData?.historyCount || 0);
        if (itemsSinceSummary >= SUMMARY_THRESHOLD) {
            // Auto-trigger summary in background (non-blocking)
            summarizeDomainHistory(domain).catch(e => console.error('Summary error:', e));
        }
    }

    // AI-powered history summarization
    async function summarizeDomainHistory(domain) {
        const history = getHistoryForDomain(domain);
        if (history.length < 3) return null;

        const editedReplies = history
            .filter(h => h.final && h.final !== h.original)
            .slice(0, 10)
            .map(h => h.final);

        if (editedReplies.length < 2) return null;

        const domainInfo = getDomainById(domain);
        const promptSystem = `你是一个风格分析专家。请分析用户在${domainInfo.name}领域的回复风格，总结为2-3句话的风格描述。
描述应该包括：语气特点、常用表达方式、情感倾向等。不要列举具体回复，只给出总结性描述。`;

        const promptUser = `用户的历史回复样本：
${editedReplies.map((r, i) => `${i + 1}. "${r}"`).join('\n')}

请用2-3句话总结这个用户的回复风格：`;

        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        if (config.requestFormat === 'anthropic') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 200,
                messages: [{ role: "user", content: promptSystem + "\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            requestData = {
                contents: [{ parts: [{ text: promptSystem + "\n\n" + promptUser }] }]
            };
        } else {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.5,
                max_tokens: 200
            };
        }

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let content = "";
                            if (config.requestFormat === 'anthropic') {
                                content = data.content?.[0]?.text || "";
                            } else if (config.requestFormat === 'gemini') {
                                content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else {
                                const choices = data.data?.choices || data.choices;
                                content = choices?.[0]?.message?.content || "";
                            }

                            if (content) {
                                historySummaryByDomain[domain] = {
                                    summary: content.trim(),
                                    lastUpdated: Date.now(),
                                    historyCount: history.length
                                };
                                GM_setValue('historySummaryByDomain', historySummaryByDomain);
                                console.log(`[X-AI-Reply] Updated style summary for ${domain}:`, content.trim());
                            }
                            resolve(content.trim());
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // Get learned patterns (uses summary if available, falls back to raw samples)
    function getLearnedPatterns(domain = 'general') {
        // Try to use AI summary first
        const summaryData = historySummaryByDomain[domain];
        if (summaryData?.summary) {
            const domainInfo = getDomainById(domain);
            return `\n\n用户在${domainInfo.name}领域的回复风格特点：${summaryData.summary}`;
        }

        // Fall back to raw samples
        const history = getHistoryForDomain(domain);
        if (history.length < 3) return '';

        const editedReplies = history
            .filter(h => h.final && h.final !== h.original)
            .slice(0, 10)
            .map(h => h.final);

        if (editedReplies.length === 0) return '';

        return `\n\n用户的历史回复风格参考（请模仿这种风格）:\n${editedReplies.slice(0, 3).map((r, i) => `${i + 1}. "${r}"`).join('\n')}`;
    }

    // Get summary status for display
    function getSummaryStatus(domain) {
        const summaryData = historySummaryByDomain[domain];
        const history = getHistoryForDomain(domain);
        if (!summaryData?.summary) {
            return { hasSummary: false, historyCount: history.length };
        }
        return {
            hasSummary: true,
            summary: summaryData.summary,
            lastUpdated: summaryData.lastUpdated,
            historyCount: history.length
        };
    }

    // --- Generation Settings Persistence ---
    const DEFAULT_GEN_SETTINGS = {
        count: '3',
        length: 'medium',
        style: 'engage',
        strategy: 'default',
        lang: 'auto'
    };
    let genSettings = GM_getValue('genSettings', DEFAULT_GEN_SETTINGS);

    function saveGenSettings(settings) {
        genSettings = { ...genSettings, ...settings };
        GM_setValue('genSettings', genSettings);
    }

    // --- Default Styles and Strategies ---
    const DEFAULT_STYLES = [
        { id: 'engage', name: '吸引关注' },
        { id: 'humor', name: '幽默搞笑' },
        { id: 'pro', name: '专业严谨' },
        { id: 'sharp', name: '犀利毒舌' },
        { id: 'warm', name: '暖心治愈' }
    ];

    const DEFAULT_STRATEGIES = [
        { id: 'default', name: '默认', desc: '自然回复' },
        { id: 'agree', name: '同意', desc: '附和热门观点' },
        { id: 'unique', name: '新观点', desc: '提出独特视角' },
        { id: 'balance', name: '平衡', desc: '客观分析' },
        { id: 'challenge', name: '反驳', desc: '挑战主流' }
    ];

    // Load custom items
    let customStyles = GM_getValue('customStyles', []);
    let customStrategies = GM_getValue('customStrategies', []);

    // Get all items (default + custom)
    function getAllStyles() {
        return [...DEFAULT_STYLES, ...customStyles];
    }

    function getAllStrategies() {
        return [...DEFAULT_STRATEGIES, ...customStrategies];
    }

    // Add custom item
    function addCustomStyle(name) {
        const id = 'custom_style_' + Date.now();
        customStyles.push({ id, name, custom: true });
        GM_setValue('customStyles', customStyles);
        return id;
    }

    function addCustomStrategy(name) {
        const id = 'custom_strategy_' + Date.now();
        customStrategies.push({ id, name, desc: name, custom: true });
        GM_setValue('customStrategies', customStrategies);
        return id;
    }

    // Remove custom item
    function removeCustomStyle(id) {
        customStyles = customStyles.filter(s => s.id !== id);
        GM_setValue('customStyles', customStyles);
    }

    function removeCustomStrategy(id) {
        customStrategies = customStrategies.filter(s => s.id !== id);
        GM_setValue('customStrategies', customStrategies);
    }

    // For backward compatibility
    const REPLY_STYLES = getAllStyles();
    const REPLY_STRATEGIES = getAllStrategies();

    // --- Reply Cache per Tweet ---
    let replyCache = GM_getValue('replyCache', {});
    const CACHE_MAX_TWEETS = 50;

    function getTweetCacheKey(tweetText) {
        // Simple hash from tweet text
        let hash = 0;
        for (let i = 0; i < Math.min(tweetText.length, 100); i++) {
            hash = ((hash << 5) - hash) + tweetText.charCodeAt(i);
            hash |= 0;
        }
        return 'tweet_' + hash;
    }

    function getCachedReplies(tweetText) {
        const key = getTweetCacheKey(tweetText);
        return replyCache[key] || null;
    }

    function saveCachedReplies(tweetText, replies) {
        const key = getTweetCacheKey(tweetText);
        replyCache[key] = { replies, timestamp: Date.now() };

        // Limit cache size
        const keys = Object.keys(replyCache);
        if (keys.length > CACHE_MAX_TWEETS) {
            // Remove oldest entries
            const sorted = keys.sort((a, b) => (replyCache[a].timestamp || 0) - (replyCache[b].timestamp || 0));
            sorted.slice(0, keys.length - CACHE_MAX_TWEETS).forEach(k => delete replyCache[k]);
        }
        GM_setValue('replyCache', replyCache);
    }

    /* =========================================================================
     * MODULE 8.5: DOMAIN CLASSIFICATION
     * =========================================================================
     * Tweet domain detection, domain-specific styles, and classification
     * ========================================================================= */

    // --- Domain Categories ---
    const DOMAIN_CATEGORIES = [
        { id: 'ai', name: '🤖 AI/科技', keywords: ['AI', 'GPT', 'LLM', 'ChatGPT', 'Claude', 'Gemini', '人工智能', '机器学习', 'deep learning', 'neural', 'transformer', 'OpenAI', 'Anthropic', '大模型', 'AGI', 'AI agent'] },
        { id: 'emotion', name: '💖 情感', keywords: ['情感', '爱情', '心理', '治愈', '感情', '恋爱', '分手', '孤独', '幸福', '温暖', 'love', 'relationship', 'feeling', 'heart', '鸡汤', '人生', '生活感悟'] },
        { id: 'politics', name: '🏛️ 政治', keywords: ['政治', '政策', '选举', '政府', '总统', 'Trump', 'Biden', '民主', '共和', 'election', 'vote', 'congress', '国会', '法案', 'policy'] },
        { id: 'tech', name: '💻 科技产品', keywords: ['iPhone', 'Android', 'Apple', 'Google', 'Microsoft', '手机', '电脑', '软件', 'App', 'startup', '创业', 'SaaS', 'web3', 'crypto', 'blockchain', '区块链'] },
        { id: 'finance', name: '💰 财经', keywords: ['股票', '投资', '经济', '金融', 'stock', 'invest', 'market', 'trading', '基金', 'ETF', '理财', 'Fed', '美联储', 'GDP', '通胀', 'inflation'] },
        { id: 'entertainment', name: '🎬 娱乐', keywords: ['电影', '音乐', '明星', '综艺', 'movie', 'music', 'celebrity', '演唱会', '专辑', 'Netflix', '剧', 'show', '偶像', '粉丝', 'fan'] },
        { id: 'sports', name: '⚽ 体育', keywords: ['足球', '篮球', '体育', '比赛', 'NBA', 'FIFA', 'football', 'soccer', 'basketball', '世界杯', '奥运', 'Olympics', '运动员', 'player', 'game'] },
        { id: 'food', name: '🍜 美食', keywords: ['美食', '餐厅', '烹饪', '食物', 'food', 'recipe', 'cooking', 'restaurant', '好吃', '菜谱', '火锅', '咖啡', 'coffee', '茶', '甜点'] },
        { id: 'general', name: '💬 通用', keywords: [] }
    ];

    // --- Default Domain Styles ---
    const DEFAULT_DOMAIN_STYLES = {
        ai: { style: 'pro', strategy: 'unique', length: 'medium' },
        emotion: { style: 'warm', strategy: 'agree', length: 'medium' },
        politics: { style: 'sharp', strategy: 'balance', length: 'long' },
        tech: { style: 'pro', strategy: 'unique', length: 'medium' },
        finance: { style: 'pro', strategy: 'balance', length: 'long' },
        entertainment: { style: 'humor', strategy: 'engage', length: 'short' },
        sports: { style: 'engage', strategy: 'agree', length: 'short' },
        food: { style: 'warm', strategy: 'engage', length: 'short' },
        general: { style: 'engage', strategy: 'default', length: 'medium' }
    };

    // --- Domain Style Storage ---
    let domainStyles = GM_getValue('domainStyles', {});

    function getDomainById(domainId) {
        return DOMAIN_CATEGORIES.find(d => d.id === domainId) || DOMAIN_CATEGORIES.find(d => d.id === 'general');
    }

    function getDomainStyle(domainId) {
        return domainStyles[domainId] || DEFAULT_DOMAIN_STYLES[domainId] || DEFAULT_DOMAIN_STYLES.general;
    }

    function saveDomainStyle(domainId, styleSettings) {
        domainStyles[domainId] = { ...getDomainStyle(domainId), ...styleSettings };
        GM_setValue('domainStyles', domainStyles);
    }

    function resetDomainStyle(domainId) {
        delete domainStyles[domainId];
        GM_setValue('domainStyles', domainStyles);
    }

    // --- Keyword-based Quick Classification ---
    function classifyByKeywords(text) {
        if (!text) return null;
        const lowerText = text.toLowerCase();

        for (const domain of DOMAIN_CATEGORIES) {
            if (domain.id === 'general') continue; // Skip general as fallback
            for (const keyword of domain.keywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    return domain.id;
                }
            }
        }
        return null; // No match found
    }

    // --- AI-powered Classification ---
    async function classifyTweetDomainAI(tweetText) {
        if (!config.apiKey) return 'general';

        const domainList = DOMAIN_CATEGORIES
            .filter(d => d.id !== 'general')
            .map(d => `${d.id}: ${d.name.replace(/[^\u4e00-\u9fff\w\/]/g, '')}`)
            .join(', ');

        const promptSystem = `你是一个推文分类专家。请将推文分类到以下领域之一：${domainList}。只返回领域ID（如 ai, emotion, politics 等），不要其他内容。`;
        const promptUser = `推文内容：${tweetText.substring(0, 300)}`;

        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        if (config.requestFormat === 'anthropic') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 50,
                messages: [{ role: "user", content: promptSystem + "\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            requestData = {
                contents: [{ parts: [{ text: promptSystem + "\n\n" + promptUser }] }]
            };
        } else {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.1,
                max_tokens: 50
            };
        }

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let content = "";
                            if (config.requestFormat === 'anthropic') {
                                content = data.content?.[0]?.text || "";
                            } else if (config.requestFormat === 'gemini') {
                                content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else {
                                const choices = data.data?.choices || data.choices;
                                content = choices?.[0]?.message?.content || "";
                            }

                            // Extract domain ID from response
                            const domainId = content.trim().toLowerCase().replace(/[^a-z]/g, '');
                            const validDomain = DOMAIN_CATEGORIES.find(d => d.id === domainId);
                            resolve(validDomain ? domainId : 'general');
                        } catch (e) {
                            resolve('general');
                        }
                    } else {
                        resolve('general');
                    }
                },
                onerror: () => resolve('general')
            });
        });
    }

    // --- Main Classification Function ---
    // Uses keyword matching first, falls back to AI if no match
    async function classifyTweetDomain(tweetText, forceAI = false) {
        if (!tweetText) return 'general';

        // Try keyword matching first (fast, no API call)
        if (!forceAI) {
            const keywordMatch = classifyByKeywords(tweetText);
            if (keywordMatch) {
                console.log(`[X-AI-Reply] Domain classified by keywords: ${keywordMatch}`);
                return keywordMatch;
            }
        }

        // Fall back to AI classification
        console.log('[X-AI-Reply] No keyword match, using AI classification...');
        const aiResult = await classifyTweetDomainAI(tweetText);
        console.log(`[X-AI-Reply] Domain classified by AI: ${aiResult}`);
        return aiResult;
    }

    // --- Domain Classification Cache ---
    let domainCache = {};

    function getCachedDomain(tweetText) {
        const key = getTweetCacheKey(tweetText);
        return domainCache[key] || null;
    }

    function setCachedDomain(tweetText, domainId) {
        const key = getTweetCacheKey(tweetText);
        domainCache[key] = domainId;
    }

    /* =========================================================================
     * MODULE 9: COMMENT ANALYSIS
     * =========================================================================
     * Scrape existing replies and AI-powered analysis
     * ========================================================================= */

    function scrapeReplies() {
        const replies = [];
        // Find all reply tweets on the page
        const replyArticles = document.querySelectorAll('article[data-testid="tweet"]');

        replyArticles.forEach((article, index) => {
            // Skip the first one (original tweet)
            if (index === 0) return;

            try {
                // Get reply text
                const textEl = article.querySelector('div[data-testid="tweetText"]');
                const text = textEl ? textEl.innerText.trim() : '';
                if (!text || text.length < 5) return;

                // Get like count - look for the like button with count
                let likes = 0;
                const likeBtn = article.querySelector('button[data-testid="like"]');
                if (likeBtn) {
                    const likeText = likeBtn.getAttribute('aria-label') || '';
                    const match = likeText.match(/(\d+)/);
                    if (match) likes = parseInt(match[1]);
                }

                // Also try to get from the span inside
                if (likes === 0) {
                    const spans = article.querySelectorAll('span');
                    spans.forEach(span => {
                        const txt = span.innerText;
                        if (/^\d+$/.test(txt) && parseInt(txt) > 0) {
                            likes = Math.max(likes, parseInt(txt));
                        }
                    });
                }

                replies.push({ text, likes });
            } catch (e) {
                console.error('Error scraping reply:', e);
            }
        });

        return replies;
    }

    function getTopReplies(replies, limit = 5) {
        return replies
            .filter(r => r.text.length > 10)
            .sort((a, b) => b.likes - a.likes)
            .slice(0, limit);
    }

    // AI-powered comment analysis
    async function analyzeComments(topReplies, originalTweet) {
        if (!config.apiKey || topReplies.length === 0) {
            return null;
        }

        const commentsText = topReplies.map((r, i) =>
            `${i + 1}. [${r.likes}赞] ${r.text}`
        ).join('\n');

        const promptSystem = "你是一个社交媒体分析专家。请简洁分析以下热门评论的主要观点。";
        const promptUser = `原推文：${originalTweet}\n\n热门评论：\n${commentsText}\n\n请用一句话总结评论区的主要观点/情绪：`;

        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        if (config.requestFormat === 'anthropic') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 200,
                messages: [{ role: "user", content: promptSystem + "\n\n---\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            requestData = {
                contents: [{ parts: [{ text: promptSystem + "\n\n" + promptUser }] }]
            };
        } else {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.5
            };
        }

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let content = "";
                            if (config.requestFormat === 'anthropic') {
                                content = data.content?.[0]?.text || "";
                            } else if (config.requestFormat === 'gemini') {
                                content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else {
                                const choices = data.data?.choices || data.choices;
                                content = choices?.[0]?.message?.content || "";
                            }
                            resolve({
                                summary: content.trim(),
                                topReplies: topReplies
                            });
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null)
            });
        });
    }

    /* =========================================================================
     * MODULE 10: OPTIONS PANEL
     * =========================================================================
     * Inline panel for reply generation options and controls
     * ========================================================================= */

    function showOptionsPanel(article) {
        // Remove existing panels for this article
        const existingPanel = article.querySelector('.x-ai-inline-panel');
        if (existingPanel) {
            existingPanel.remove();
            return; // Toggle off if already open
        }

        const tweetText = getTweetText(article);
        const tweetImages = getTweetImages(article);

        if (!tweetText && tweetImages.length === 0) {
            showError(article, '无法获取推文内容');
            return;
        }

        // Find container to insert panel (after action bar)
        const actionBar = article.querySelector('div[role="group"]');
        if (!actionBar) return;
        const container = actionBar.parentNode;

        // Create inline panel
        const panel = document.createElement('div');
        panel.className = 'x-ai-inline-panel';
        panel.style.cssText = `
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 0;
            margin-top: 10px;
            animation: x-ai-fade-in 0.2s;
            overflow: hidden;
        `;
        const activeChannel = getSavedChannels().find(c => c.id === getActiveChannelId());
        const channelName = activeChannel?.name || '未配置';
        const modelName = config.model || '未选择';

        panel.innerHTML = `
            <!-- Header with quick settings -->
            <div style="padding: 12px 15px; border-bottom: 1px solid #333;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 14px; font-weight: 600; color: #e7e9ea;">🤖 AI 回复</span>
                        <span class="x-ai-channel-info" style="font-size: 11px; color: #888; cursor: pointer;" title="点击切换渠道/模型">
                            📡 ${channelName} / ${modelName}
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 10px; color: #666;">
                            <input type="checkbox" class="x-ai-stream-toggle" ${genSettings.stream ? 'checked' : ''} style="width: 12px; height: 12px; cursor: pointer;">
                            <span>流式</span>
                        </label>
                        <select class="x-ai-lang-select" style="padding: 4px 8px; background: #222; border: 1px solid #444; color: #888; border-radius: 6px; font-size: 11px; cursor: pointer;">
                            ${REPLY_LANGUAGES.map(l => `<option value="${l.id}"${genSettings.lang === l.id ? ' selected' : ''}>${l.name}</option>`).join('')}
                        </select>
                        <button class="x-ai-toggle-settings" style="background: none; border: none; color: #888; font-size: 14px; cursor: pointer; padding: 2px;" title="切换渠道/模型">⚙️</button>
                        <button class="x-ai-inline-close" style="background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">×</button>
                    </div>
                </div>
                <!-- Domain selector area -->
                <div class="x-ai-domain-display" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 11px; color: #888;">🏷️ 领域:</span>
                    <select class="x-ai-domain-select" style="padding: 3px 8px; background: #222; border: 1px solid #444; color: #e7e9ea; border-radius: 6px; font-size: 11px; cursor: pointer;">
                        <option value="auto">🔄 自动检测</option>
                        ${DOMAIN_CATEGORIES.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                    <span class="x-ai-domain-status" style="font-size: 10px; color: #666;"></span>
                </div>
                <!-- Expandable channel/model selector (hidden by default) -->
                <div class="x-ai-quick-settings" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select class="x-ai-channel-quick" style="flex: 1; padding: 6px 10px; background: #1a1a1a; border: 1px solid #333; color: #e7e9ea; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            ${getSavedChannels().map(c => `<option value="${c.id}" ${c.id === getActiveChannelId() ? 'selected' : ''}>${c.name}</option>`).join('') || '<option value="">未配置渠道</option>'}
                        </select>
                        <select class="x-ai-model-quick" style="flex: 1; padding: 6px 10px; background: #1a1a1a; border: 1px solid #333; color: #e7e9ea; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            ${(config.modelList || []).map(m => `<option value="${m}" ${m === config.model ? 'selected' : ''}>${m}</option>`).join('') || '<option value="">无可用模型</option>'}
                        </select>
                        <button class="x-ai-settings-btn" style="padding: 6px 10px; background: #333; border: none; color: #888; border-radius: 6px; font-size: 12px; cursor: pointer;" title="完整设置">📋</button>
                    </div>
                </div>
            </div>
            
            <!-- Tabs -->
            <div style="display: flex; border-bottom: 1px solid #333;">
                <button class="x-ai-tab active" data-tab="settings" style="flex: 1; padding: 10px; background: transparent; border: none; color: #1d9bf0; font-size: 12px; font-weight: 600; cursor: pointer; border-bottom: 2px solid #1d9bf0;">⚙️ 设置</button>
                <button class="x-ai-tab" data-tab="results" style="flex: 1; padding: 10px; background: transparent; border: none; color: #888; font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent;">📋 结果</button>
                <button class="x-ai-tab" data-tab="history" style="flex: 1; padding: 10px; background: transparent; border: none; color: #888; font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent;">📜 历史</button>
            </div>
            
            <!-- Settings Tab Content -->
            <div class="x-ai-tab-content" data-tab="settings" style="padding: 15px;">
                <!-- 领域风格应用提示 -->
                <div class="x-ai-domain-hint" style="display: none; margin-bottom: 10px; padding: 8px 10px; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px; font-size: 11px; color: #4ade80;">
                    ✨ 已应用 <span class="x-ai-domain-hint-name"></span> 领域的默认风格
                </div>
                
                <!-- 数量 + 字数 同一行 -->
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 11px; color: #888;">数量:</span>
                        <div class="x-ai-chips" data-option="count" style="gap: 4px;">
                            <button class="x-ai-chip${genSettings.count === '1' ? ' active' : ''}" data-value="1">1</button>
                            <button class="x-ai-chip${genSettings.count === '2' ? ' active' : ''}" data-value="2">2</button>
                            <button class="x-ai-chip${genSettings.count === '3' ? ' active' : ''}" data-value="3">3</button>
                            <button class="x-ai-chip${genSettings.count === '5' ? ' active' : ''}" data-value="5">5</button>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 11px; color: #888;">字数:</span>
                        <div class="x-ai-chips" data-option="length" style="gap: 4px;">
                            <button class="x-ai-chip${genSettings.length === 'short' ? ' active' : ''}" data-value="short">短</button>
                            <button class="x-ai-chip${genSettings.length === 'medium' ? ' active' : ''}" data-value="medium">中</button>
                            <button class="x-ai-chip${genSettings.length === 'long' ? ' active' : ''}" data-value="long">长</button>
                        </div>
                    </div>
                </div>
                
                <!-- 风格 单独一行 -->
                <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 10px;">
                    <span style="font-size: 11px; color: #888; padding-top: 6px;">风格:</span>
                    <div class="x-ai-chips" data-option="style" style="flex: 1;">
                        ${getAllStyles().map(s => `<button class="x-ai-chip${genSettings.style === s.id ? ' active' : ''}${s.custom ? ' custom' : ''}" data-value="${s.id}" data-custom="${s.custom || false}">${s.name}${s.custom ? '<span class="x-ai-chip-delete" style="margin-left:4px;color:#f87171;">×</span>' : ''}</button>`).join('')}
                        <button class="x-ai-chip x-ai-add-style" style="color: #888; border-style: dashed;">+ 添加</button>
                    </div>
                </div>
                
                <!-- 策略 单独一行 -->
                <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: #888; padding-top: 6px;">策略:</span>
                    <div class="x-ai-chips" data-option="strategy" style="flex: 1;">
                        ${getAllStrategies().map(s => `<button class="x-ai-chip${genSettings.strategy === s.id ? ' active' : ''}${s.custom ? ' custom' : ''}" data-value="${s.id}" data-custom="${s.custom || false}">${s.name}${s.custom ? '<span class="x-ai-chip-delete" style="margin-left:4px;color:#f87171;">×</span>' : ''}</button>`).join('')}
                        <button class="x-ai-chip x-ai-add-strategy" style="color: #888; border-style: dashed;">+ 添加</button>
                    </div>
                </div>
                
                <!-- 分析评论区 -->
                <div style="margin-bottom: 12px;">
                    <button class="x-ai-analyze-btn" style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #888; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        📊 分析评论区热评
                    </button>
                    <div class="x-ai-analysis-log" style="display: none; margin-top: 8px; padding: 8px; background: #111; border-radius: 6px; font-family: monospace; font-size: 10px; color: #666; max-height: 100px; overflow-y: auto;"></div>
                    <div class="x-ai-analysis-result" style="display: none; margin-top: 8px; padding: 10px; background: rgba(29, 155, 240, 0.1); border-radius: 8px; border: 1px solid rgba(29, 155, 240, 0.2);">
                        <div style="font-size: 11px; color: #1d9bf0; margin-bottom: 4px;">💬 评论区观点：</div>
                        <div class="x-ai-analysis-text" style="font-size: 12px; color: #e7e9ea; line-height: 1.4;"></div>
                    </div>
                </div>
                
                <button class="x-ai-inline-generate" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #1d9bf0, #1a8cd8); color: #fff; border: none; border-radius: 9999px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(29, 155, 240, 0.3);">✨ 生成回复</button>
                
                <!-- 执行日志 -->
                <div class="x-ai-gen-log" style="display: none; margin-top: 10px; padding: 10px; background: #0d0d0d; border: 1px solid #222; border-radius: 8px; font-family: 'SF Mono', Monaco, monospace; font-size: 10px; max-height: 120px; overflow-y: auto;"></div>
            </div>
            
            <!-- Results Tab Content -->
            <div class="x-ai-tab-content" data-tab="results" style="padding: 15px; display: none;">
                <div class="x-ai-inline-results-empty" style="text-align: center; padding: 20px; color: #666; font-size: 13px;">
                    👆 请先在"设置"中生成回复
                </div>
                <div class="x-ai-inline-results" style="display: none;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-size: 12px; color: #888;">点击选择回复：</span>
                        <button class="x-ai-inline-regenerate" style="padding: 4px 10px; background: transparent; color: #1d9bf0; border: 1px solid #1d9bf0; border-radius: 12px; font-size: 11px; cursor: pointer;">🔄 重新</button>
                    </div>
                    <div class="x-ai-inline-list" style="max-height: 250px; overflow-y: auto;"></div>
                </div>
            </div>
            
            <!-- History Tab Content -->
            <div class="x-ai-tab-content" data-tab="history" style="padding: 15px; display: none;">
                <div class="x-ai-history-empty" style="text-align: center; padding: 20px; color: #666; font-size: 13px;">
                    暂无历史记录
                </div>
                <div class="x-ai-history-list" style="max-height: 250px; overflow-y: auto;"></div>
            </div>
        `;
        container.appendChild(panel);

        const panelId = article.dataset.aiReplyAdded;
        const closeBtn = panel.querySelector('.x-ai-inline-close');
        const generateBtn = panel.querySelector('.x-ai-inline-generate');
        const resultsDiv = panel.querySelector('.x-ai-inline-results');
        const resultsEmpty = panel.querySelector('.x-ai-inline-results-empty');
        const replyList = panel.querySelector('.x-ai-inline-list');
        const regenerateBtn = panel.querySelector('.x-ai-inline-regenerate');
        const tabs = panel.querySelectorAll('.x-ai-tab');
        const tabContents = panel.querySelectorAll('.x-ai-tab-content');
        const langSelect = panel.querySelector('.x-ai-lang-select');
        const historyEmpty = panel.querySelector('.x-ai-history-empty');
        const historyList = panel.querySelector('.x-ai-history-list');

        // Quick channel/model selectors
        const channelQuick = panel.querySelector('.x-ai-channel-quick');
        const modelQuick = panel.querySelector('.x-ai-model-quick');
        const settingsBtn = panel.querySelector('.x-ai-settings-btn');
        const quickSettings = panel.querySelector('.x-ai-quick-settings');
        const toggleSettingsBtn = panel.querySelector('.x-ai-toggle-settings');
        const channelInfo = panel.querySelector('.x-ai-channel-info');

        // Toggle expand/collapse quick settings
        const toggleQuickSettings = () => {
            const isHidden = quickSettings.style.display === 'none';
            quickSettings.style.display = isHidden ? 'block' : 'none';
            toggleSettingsBtn.style.color = isHidden ? '#1d9bf0' : '#888';
        };
        toggleSettingsBtn.onclick = toggleQuickSettings;
        channelInfo.onclick = toggleQuickSettings;

        // Update channel info text when switching
        const updateChannelInfo = () => {
            const ch = getSavedChannels().find(c => c.id === getActiveChannelId());
            channelInfo.textContent = `📡 ${ch?.name || '未配置'} / ${config.model || '未选择'}`;
        };

        // Channel quick switch
        channelQuick.onchange = () => {
            const channelId = channelQuick.value;
            if (channelId) {
                setActiveChannel(channelId);
                // Update model dropdown with new channel's models
                modelQuick.innerHTML = (config.modelList || []).map(m =>
                    `<option value="${m}" ${m === config.model ? 'selected' : ''}>${m}</option>`
                ).join('') || '<option value="">无可用模型</option>';
                updateChannelInfo();
            }
        };

        // Model quick switch
        modelQuick.onchange = () => {
            config.model = modelQuick.value;
            GM_setValue('config', config);
            // Update active channel's model too
            const activeId = getActiveChannelId();
            if (activeId) {
                const channels = getSavedChannels();
                const idx = channels.findIndex(c => c.id === activeId);
                if (idx >= 0) {
                    channels[idx].model = config.model;
                    GM_setValue('savedChannels', channels);
                }
            }
            updateChannelInfo();
        };

        // Settings button
        settingsBtn.onclick = () => {
            panel.remove();
            createSettingsModal();
        };

        // --- Domain Detection and Auto-Style ---
        const domainSelect = panel.querySelector('.x-ai-domain-select');
        const domainStatus = panel.querySelector('.x-ai-domain-status');
        const domainHint = panel.querySelector('.x-ai-domain-hint');
        const domainHintName = panel.querySelector('.x-ai-domain-hint-name');
        let currentDomain = 'general';
        let isAutoMode = true;

        // Function to update chip selection
        const selectChip = (optionName, value) => {
            const chipGroup = panel.querySelector(`.x-ai-chips[data-option="${optionName}"]`);
            if (!chipGroup) return;
            chipGroup.querySelectorAll('.x-ai-chip').forEach(c => c.classList.remove('active'));
            const targetChip = chipGroup.querySelector(`.x-ai-chip[data-value="${value}"]`);
            if (targetChip) {
                targetChip.classList.add('active');
            }
        };

        // Apply domain style to UI
        const applyDomainStyle = (domainId) => {
            const domainStyle = getDomainStyle(domainId);
            selectChip('style', domainStyle.style);
            selectChip('strategy', domainStyle.strategy);
            selectChip('length', domainStyle.length);

            // Show hint
            const domain = getDomainById(domainId);
            domainHintName.textContent = domain.name;
            domainHint.style.display = domainId !== 'general' ? 'block' : 'none';
        };

        // Auto-detect domain function
        const autoDetectDomain = async () => {
            domainStatus.textContent = '检测中...';
            domainStatus.style.color = '#1d9bf0';

            // Check cache first
            const cachedDomain = getCachedDomain(tweetText);
            if (cachedDomain) {
                currentDomain = cachedDomain;
                domainStatus.textContent = `→ ${getDomainById(cachedDomain).name} (缓存)`;
                domainStatus.style.color = '#4ade80';
                applyDomainStyle(cachedDomain);
                return cachedDomain;
            }

            try {
                const detectedDomain = await classifyTweetDomain(tweetText, false);
                currentDomain = detectedDomain;
                setCachedDomain(tweetText, detectedDomain);

                const wasKeyword = classifyByKeywords(tweetText) !== null;
                domainStatus.textContent = `→ ${getDomainById(detectedDomain).name} (${wasKeyword ? '关键词' : 'AI'})`;
                domainStatus.style.color = '#4ade80';

                applyDomainStyle(detectedDomain);
                return detectedDomain;
            } catch (e) {
                console.error('Domain detection error:', e);
                currentDomain = 'general';
                domainStatus.textContent = '→ 通用 (默认)';
                domainStatus.style.color = '#888';
                return 'general';
            }
        };

        // Handle domain select change
        domainSelect.onchange = () => {
            const selected = domainSelect.value;
            if (selected === 'auto') {
                isAutoMode = true;
                autoDetectDomain();
            } else {
                isAutoMode = false;
                currentDomain = selected;
                domainStatus.textContent = '(手动选择)';
                domainStatus.style.color = '#888';
                applyDomainStyle(selected);
            }
        };

        // Auto-detect on panel open (default mode)
        autoDetectDomain();


        const cached = getCachedReplies(tweetText);
        if (cached && cached.replies && cached.replies.length > 0) {
            historyEmpty.style.display = 'none';
            historyList.innerHTML = cached.replies.map((r, i) => {
                // Support both old format (string) and new format (object)
                const replyText = typeof r === 'string' ? r : r.reply;
                const translationText = typeof r === 'string' ? null : r.translation;
                const hasTranslation = translationText && !containsChinese(replyText);

                return `
                    <div class="x-ai-reply-card" data-index="${i}" data-reply="${encodeURIComponent(replyText)}" style="padding: 10px; background: #111; border: 1px solid #333; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;">
                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">历史 ${i + 1}</div>
                        <div class="x-ai-reply-original" style="font-size: 13px; line-height: 1.4; color: #e7e9ea;">${replyText}</div>
                        ${hasTranslation ? `<div class="x-ai-reply-translation" style="font-size: 12px; line-height: 1.4; color: #888; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #333;"><span style="color: #1d9bf0;">📝 中文:</span> ${translationText}</div>` : ''}
                    </div>
                `;
            }).join('');
            // Add hover and click handlers for history items
            historyList.querySelectorAll('.x-ai-reply-card').forEach(card => {
                card.onmouseenter = () => { card.style.borderColor = '#1d9bf0'; card.style.background = '#1a1a1a'; };
                card.onmouseleave = () => { card.style.borderColor = '#333'; card.style.background = '#111'; };
                card.onclick = async () => {
                    const selectedReply = decodeURIComponent(card.dataset.reply);
                    const replyBtn = article.querySelector('button[data-testid="reply"]');
                    if (replyBtn) {
                        replyBtn.click();
                        await new Promise(r => setTimeout(r, 500));
                        await insertTextIntoEditor(selectedReply);
                        window._pendingReply = { original: selectedReply, tweetContext: tweetText, domain: currentDomain };
                    }
                };
            });
        }

        // Tab switching
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => {
                    t.style.color = '#888';
                    t.style.borderBottomColor = 'transparent';
                    t.classList.remove('active');
                });
                tab.style.color = '#1d9bf0';
                tab.style.borderBottomColor = '#1d9bf0';
                tab.classList.add('active');

                tabContents.forEach(c => {
                    c.style.display = c.dataset.tab === tab.dataset.tab ? 'block' : 'none';
                });
            };
        });

        // Chip selection with save (excluding add buttons)
        panel.querySelectorAll('.x-ai-chips').forEach(chipGroup => {
            const optionName = chipGroup.dataset.option;
            chipGroup.querySelectorAll('.x-ai-chip:not(.x-ai-add-style):not(.x-ai-add-strategy)').forEach(chip => {
                chip.onclick = (e) => {
                    // Check if clicking delete button
                    if (e.target.classList.contains('x-ai-chip-delete')) {
                        e.stopPropagation();
                        const chipId = chip.dataset.value;
                        if (optionName === 'style') {
                            removeCustomStyle(chipId);
                        } else if (optionName === 'strategy') {
                            removeCustomStrategy(chipId);
                        }
                        // Refresh panel
                        panel.remove();
                        showOptionsPanel(article);
                        return;
                    }

                    chipGroup.querySelectorAll('.x-ai-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    // Save setting
                    saveGenSettings({ [optionName]: chip.dataset.value });
                };
            });
        });

        // Add style button
        const addStyleBtn = panel.querySelector('.x-ai-add-style');
        if (addStyleBtn) {
            addStyleBtn.onclick = () => {
                const name = prompt('请输入新风格名称（可包含 emoji）：');
                if (name && name.trim()) {
                    addCustomStyle(name.trim());
                    // Refresh panel
                    panel.remove();
                    showOptionsPanel(article);
                }
            };
        }

        // Add strategy button
        const addStrategyBtn = panel.querySelector('.x-ai-add-strategy');
        if (addStrategyBtn) {
            addStrategyBtn.onclick = () => {
                const name = prompt('请输入新策略名称（可包含 emoji）：');
                if (name && name.trim()) {
                    addCustomStrategy(name.trim());
                    // Refresh panel
                    panel.remove();
                    showOptionsPanel(article);
                }
            };
        }

        // Language select save
        langSelect.onchange = () => {
            saveGenSettings({ lang: langSelect.value });
        };

        // Stream toggle save
        const streamToggle = panel.querySelector('.x-ai-stream-toggle');
        streamToggle.onchange = () => {
            saveGenSettings({ stream: streamToggle.checked });
        };

        // Helper to get active chip value
        const getChipValue = (option) => {
            const active = panel.querySelector(`.x-ai-chips[data-option="${option}"] .x-ai-chip.active`);
            return active ? active.dataset.value : null;
        };

        closeBtn.onclick = () => panel.remove();

        // Analysis state
        let analysisResult = null;
        const analyzeBtn = panel.querySelector('.x-ai-analyze-btn');
        const analysisResultDiv = panel.querySelector('.x-ai-analysis-result');
        const analysisTextDiv = panel.querySelector('.x-ai-analysis-text');

        // Analyze button handler
        const analysisLogDiv = panel.querySelector('.x-ai-analysis-log');

        const addLog = (msg, type = 'info') => {
            const colors = { info: '#888', success: '#4ade80', error: '#f87171', warn: '#fbbf24' };
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            analysisLogDiv.innerHTML += `<div style="color: ${colors[type] || colors.info};">[${time}] ${msg}</div>`;
            analysisLogDiv.scrollTop = analysisLogDiv.scrollHeight;
        };

        analyzeBtn.onclick = async () => {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<div class="x-ai-spinner" style="display:inline-block; width:12px; height:12px; margin-right:6px; vertical-align:middle;"></div>分析中...';

            // Show and clear log
            analysisLogDiv.innerHTML = '';
            analysisLogDiv.style.display = 'block';
            analysisResultDiv.style.display = 'none';

            try {
                addLog('🔍 开始抓取页面评论...');
                const allReplies = scrapeReplies();
                addLog(`✅ 抓取完成: 共找到 ${allReplies.length} 条评论`, 'success');

                const topReplies = getTopReplies(allReplies, 5);
                addLog(`📊 筛选热评: ${topReplies.length} 条高赞评论`);

                if (topReplies.length === 0) {
                    addLog('⚠️ 未找到足够的评论', 'warn');
                    analysisTextDiv.textContent = '未找到足够的评论进行分析';
                    analysisResultDiv.style.display = 'block';
                } else {
                    // Show top replies in log
                    topReplies.forEach((r, i) => {
                        addLog(`  ${i + 1}. [${r.likes}赞] ${r.text.substring(0, 30)}...`);
                    });

                    addLog('🤖 调用 AI 分析评论观点...');
                    analysisResult = await analyzeComments(topReplies, tweetText);

                    if (analysisResult && analysisResult.summary) {
                        addLog('✅ AI 分析完成', 'success');
                        analysisTextDiv.textContent = analysisResult.summary;
                        analysisResultDiv.style.display = 'block';
                    } else {
                        addLog('⚠️ AI 未返回总结，使用原始数据', 'warn');
                        analysisTextDiv.textContent = `已分析 ${topReplies.length} 条热评`;
                        analysisResultDiv.style.display = 'block';
                        analysisResult = { topReplies };
                    }
                }
            } catch (e) {
                console.error('Analysis error:', e);
                addLog(`❌ 分析失败: ${e.message}`, 'error');
                analysisTextDiv.textContent = '分析失败: ' + e.message;
                analysisResultDiv.style.display = 'block';
            } finally {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '📊 分析评论区热评';
            }
        };

        // Generation execution log
        const genLogDiv = panel.querySelector('.x-ai-gen-log');
        const addGenLog = (msg, type = 'info') => {
            const colors = { info: '#888', success: '#4ade80', error: '#f87171', warn: '#fbbf24', action: '#1d9bf0' };
            const icons = { info: '○', success: '✓', error: '✗', warn: '⚠', action: '▸' };
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            genLogDiv.innerHTML += `<div style="color: ${colors[type] || colors.info}; margin-bottom: 2px;"><span style="opacity: 0.5;">[${time}]</span> ${icons[type] || '○'} ${msg}</div>`;
            genLogDiv.scrollTop = genLogDiv.scrollHeight;
        };

        async function doGenerate() {
            const style = getChipValue('style') || 'engage';
            const lang = langSelect.value || 'auto';
            const count = parseInt(getChipValue('count') || '3');
            const length = getChipValue('length') || 'medium';
            const strategy = getChipValue('strategy') || 'default';

            // Show and clear log
            genLogDiv.innerHTML = '';
            genLogDiv.style.display = 'block';

            generateBtn.disabled = true;
            generateBtn.style.background = 'linear-gradient(135deg, #444, #333)';
            generateBtn.innerHTML = '<div class="x-ai-spinner" style="display:inline-block; width:14px; height:14px; margin-right:8px; vertical-align:middle;"></div>生成中...';

            // Clear previous results
            replyList.innerHTML = '';
            resultsDiv.style.display = 'none';

            addGenLog('开始生成回复...', 'action');
            addGenLog(`配置: ${count}条 | ${length}长度 | ${style}风格 | 领域: ${getDomainById(currentDomain).name}`, 'info');

            if (tweetImages.length > 0) {
                addGenLog(`检测到 ${tweetImages.length} 张图片，将使用视觉模型`, 'info');
            }

            // Show preview area
            resultsEmpty.style.display = 'none';
            resultsDiv.style.display = 'block';

            const useStream = streamToggle.checked;
            let replies;

            if (useStream) {
                // Streaming mode
                replyList.innerHTML = '<div class="x-ai-stream-preview" style="padding: 15px; background: #111; border: 1px solid #333; border-radius: 8px; font-size: 13px; line-height: 1.6; color: #e7e9ea; white-space: pre-wrap;"><span class="x-ai-stream-cursor" style="animation: x-ai-blink 1s infinite;">▊</span></div>';
                const streamPreview = replyList.querySelector('.x-ai-stream-preview');

                try {
                    addGenLog(`调用 AI API (${config.requestFormat}/${config.model}) 流式传输...`, 'action');
                    addGenLog(`API Base: ${config.apiBaseUrl}`, 'info');
                    // Build URL for logging
                    let logUrl = config.requestFormat === 'anthropic'
                        ? `${config.apiBaseUrl}/v1/messages`
                        : config.requestFormat === 'gemini'
                            ? `${config.apiBaseUrl}/v1beta/models/${config.model}:...`
                            : `${config.apiBaseUrl}/v1/chat/completions`;
                    addGenLog(`完整 URL: ${logUrl}`, 'info');

                    replies = await generateMultipleRepliesStream(
                        tweetText, style, lang, count, length, strategy, analysisResult, tweetImages, currentDomain,
                        (content) => {
                            streamPreview.innerHTML = content.replace(/\n/g, '<br>') + '<span class="x-ai-stream-cursor" style="background: #1d9bf0; animation: x-ai-blink 1s infinite;">▊</span>';
                            streamPreview.scrollTop = streamPreview.scrollHeight;
                        }
                    );
                } catch (streamError) {
                    addGenLog(`流式传输失败: ${streamError}`, 'error');
                    addGenLog(`切换到普通模式...`, 'warn');
                    streamPreview.innerHTML = '<span style="color: #888;">正在使用普通模式生成...</span>';
                    replies = await generateMultipleReplies(tweetText, style, lang, count, length, strategy, analysisResult, tweetImages, currentDomain);
                }
            } else {
                // Normal mode
                replyList.innerHTML = '<div style="padding: 15px; text-align: center; color: #888;"><div class="x-ai-spinner" style="display: inline-block; margin-bottom: 8px;"></div><div>正在生成...</div></div>';
                addGenLog(`调用 AI API (${config.requestFormat}/${config.model})...`, 'action');
                addGenLog(`API 地址: ${config.apiBaseUrl}`, 'info');
                replies = await generateMultipleReplies(tweetText, style, lang, count, length, strategy, analysisResult, tweetImages, currentDomain);
            }

            try {

                if (replies && replies.length > 0) {
                    // Hide empty state, show results
                    resultsEmpty.style.display = 'none';
                    resultsDiv.style.display = 'block';

                    // Auto-switch to results tab
                    tabs.forEach(t => {
                        const isResults = t.dataset.tab === 'results';
                        t.style.color = isResults ? '#1d9bf0' : '#888';
                        t.style.borderBottomColor = isResults ? '#1d9bf0' : 'transparent';
                    });
                    tabContents.forEach(c => {
                        c.style.display = c.dataset.tab === 'results' ? 'block' : 'none';
                    });

                    // Render cards with inline translations (replies are now objects with {reply, translation})
                    replyList.innerHTML = replies.map((r, i) => {
                        const replyText = typeof r === 'string' ? r : r.reply;
                        const translationText = typeof r === 'string' ? null : r.translation;
                        const hasTranslation = translationText && !containsChinese(replyText);

                        return `
                            <div class="x-ai-reply-card" data-index="${i}" data-reply="${encodeURIComponent(replyText)}" style="padding: 10px; background: #111; border: 1px solid #333; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;">
                                <div style="font-size: 11px; color: #888; margin-bottom: 4px;">回复 ${i + 1}</div>
                                <div class="x-ai-reply-original" style="font-size: 13px; line-height: 1.4; color: #e7e9ea;">${replyText}</div>
                                ${hasTranslation ? `<div class="x-ai-reply-translation" style="font-size: 12px; line-height: 1.4; color: #888; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #333;"><span style="color: #1d9bf0;">📝 中文:</span> ${translationText}</div>` : ''}
                            </div>
                        `;
                    }).join('');

                    // Save to cache (save full reply objects with translations)
                    saveCachedReplies(tweetText, replies.map(r => typeof r === 'string' ? { reply: r, translation: null } : r));

                    // Add hover and click handlers
                    replyList.querySelectorAll('.x-ai-reply-card').forEach(card => {
                        card.onmouseenter = () => { card.style.borderColor = '#1d9bf0'; card.style.background = '#1a1a1a'; };
                        card.onmouseleave = () => { card.style.borderColor = '#333'; card.style.background = '#111'; };
                        card.onclick = async () => {
                            const selectedReply = decodeURIComponent(card.dataset.reply);

                            // Close panel
                            panel.remove();

                            // Open reply box and insert text
                            const replyBtn = article.querySelector('button[data-testid="reply"]');
                            if (replyBtn) {
                                replyBtn.click();
                                await new Promise(r => setTimeout(r, 500));
                                await insertTextIntoEditor(selectedReply);

                                // Record for learning
                                window._pendingReply = {
                                    original: selectedReply,
                                    tweetContext: tweetText,
                                    domain: currentDomain
                                };
                            }
                        };
                    });

                    addGenLog(`成功生成 ${replies.length} 条回复`, 'success');
                }
            } catch (error) {
                console.error(error);
                addGenLog(`生成失败: ${error}`, 'error');
                replyList.innerHTML = `
                    <div style="padding: 15px; text-align: center;">
                        <div style="color: #ff4444; font-size: 13px; margin-bottom: 12px;">❌ ${error}</div>
                        <button class="x-ai-retry-btn" style="padding: 8px 16px; background: linear-gradient(135deg, #1d9bf0, #1a8cd8); color: #fff; border: none; border-radius: 20px; font-size: 12px; cursor: pointer;">🔄 重试</button>
                    </div>`;
                replyList.querySelector('.x-ai-retry-btn').onclick = doGenerate;
                resultsDiv.style.display = 'block';
            } finally {
                generateBtn.disabled = false;
                generateBtn.style.background = 'linear-gradient(135deg, #1d9bf0, #1a8cd8)';
                generateBtn.innerHTML = '✨ 生成回复';
            }
        }

        generateBtn.onclick = doGenerate;
        regenerateBtn.onclick = doGenerate;
    }

    /* =========================================================================
     * MODULE 11: API REQUESTS
     * =========================================================================
     * AI API calls for reply generation, streaming, and translation
     * ========================================================================= */

    async function generateMultipleReplies(tweetContent, style, lang, count, length = 'medium', strategy = 'default', analysisResult = null, images = [], domain = null) {
        if (!config.apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }

        const styleMap = {
            engage: '吸引人注意，增加互动和曝光，让人想点赞转发',
            humor: '幽默搞笑，轻松有趣',
            pro: '专业严谨，有深度',
            sharp: '犀利毒舌，观点独特',
            warm: '暖心治愈，温暖鼓励'
        };

        const langMap = {
            auto: '与原推文相同的语言',
            zh: '中文',
            en: 'English',
            ja: '日本語',
            ko: '한국어'
        };

        const lengthMap = {
            short: '简短精炼，不超过30字',
            medium: '适中长度，30-80字',
            long: '详细一些，80-150字'
        };

        const strategyMap = {
            default: '自然回复，根据推文内容自由发挥',
            agree: '赞同评论区的主流观点，表达共鸣和支持',
            unique: '提出独特的新观点或新角度，吸引关注',
            balance: '客观分析，提供平衡的多角度看法',
            challenge: '提出不同意见，友善地挑战主流观点'
        };

        const learnedPatterns = getLearnedPatterns(domain);

        // Build context from analysis
        let analysisContext = '';
        if (analysisResult) {
            if (analysisResult.summary) {
                analysisContext = `\n\n评论区热评总结：${analysisResult.summary}`;
            }
            if (analysisResult.topReplies && analysisResult.topReplies.length > 0) {
                const topComments = analysisResult.topReplies.slice(0, 3).map(r => `"${r.text}"`).join('；');
                analysisContext += `\n热门评论示例：${topComments}`;
            }
        }

        const hasImages = images && images.length > 0;
        const imageNote = hasImages ? '\n注意：推文包含图片，请结合图片内容生成回复。' : '';

        // Request translation if not Chinese
        const needsTranslation = lang !== 'zh';
        const translationNote = needsTranslation ? '\n如果回复语言不是中文，请在每条回复后附加中文翻译，格式为：\n回复内容\n[翻译] 中文翻译' : '';

        // Domain context for more relevant replies
        let domainContext = '';
        if (domain && domain !== 'general') {
            const domainInfo = getDomainById(domain);
            const domainGuidance = {
                ai: '请展现对AI技术的理解，可以提及相关技术概念、产品或趋势。',
                emotion: '请展现同理心和情感共鸣，语气要给人温暖感。',
                politics: '保持客观理性，避免过于极端的立场，但可以有自己的观点。',
                tech: '可以提及具体的产品功能、使用体验或行业趋势。',
                finance: '可以提及市场分析、投资观点，但避免不当投资建议。',
                entertainment: '保持轻松有趣，可以表达对明星/作品的喜爱或看法。',
                sports: '展现对运动/比赛的热情，可以评价表现或预测结果。',
                food: '展现对美食的欣赏，可以分享味道感受或推荐。'
            };
            domainContext = `\n\n这是一条关于【${domainInfo.name}】领域的推文。${domainGuidance[domain] || ''}`;
        }

        const promptSystem = `你是一个社交媒体高手，擅长写出吸引人的回复。
风格要求：${styleMap[style] || styleMap.engage}
语言要求：${langMap[lang] || langMap.auto}
字数要求：${lengthMap[length] || lengthMap.medium}
回复策略：${strategyMap[strategy] || strategyMap.default}
回复不要像机器人，要有个性和真实感。${domainContext}${learnedPatterns}${analysisContext}${imageNote}${translationNote}`;

        const promptUser = `请为以下推文生成 ${count} 条不同的回复，每条回复用 --- 分隔：

推文内容：${tweetContent || '[无文字，请根据图片内容回复]'}

请直接给出 ${count} 条回复，用 --- 分隔：`;

        // Use existing API call logic
        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        // Try with images first, fallback to text-only if fails
        const buildRequest = async (withImages) => {
            if (config.requestFormat === 'anthropic') {
                url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
                headers["x-api-key"] = config.apiKey;
                headers["anthropic-version"] = "2023-06-01";

                let userContent;
                if (withImages && hasImages) {
                    // Anthropic requires base64 images
                    const imageContents = [];
                    for (const imgUrl of images.slice(0, 2)) {
                        const base64 = await imageUrlToBase64(imgUrl);
                        if (base64) {
                            imageContents.push({
                                type: "image",
                                source: { type: "base64", media_type: "image/jpeg", data: base64 }
                            });
                        }
                    }
                    userContent = [...imageContents, { type: "text", text: promptUser }];
                } else {
                    userContent = promptUser;
                }

                // Note: Some proxies don't support 'system' field, so we prepend it to user message
                const fullUserMessage = promptSystem + "\n\n---\n\n" + (typeof userContent === 'string' ? userContent : promptUser);

                requestData = {
                    model: config.model,
                    max_tokens: 2048,
                    messages: [{ role: "user", content: typeof userContent === 'string' ? fullUserMessage : userContent }]
                };
            } else if (config.requestFormat === 'gemini') {
                url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

                const parts = [{ text: promptSystem + "\n\n" + promptUser }];
                if (withImages && hasImages) {
                    // Gemini supports inline image URLs via inlineData
                    for (const imgUrl of images.slice(0, 2)) {
                        const base64 = await imageUrlToBase64(imgUrl);
                        if (base64) {
                            parts.unshift({ inlineData: { mimeType: "image/jpeg", data: base64 } });
                        }
                    }
                }

                requestData = {
                    contents: [{ parts }]
                };
            } else {
                // OpenAI Chat Completions API (/v1/chat/completions)
                url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
                headers["Authorization"] = `Bearer ${config.apiKey}`;

                let userContent;
                if (withImages && hasImages) {
                    // OpenAI Vision format
                    userContent = [
                        { type: "text", text: promptUser },
                        ...images.slice(0, 2).map(imgUrl => ({
                            type: "image_url",
                            image_url: { url: imgUrl }
                        }))
                    ];
                } else {
                    userContent = promptUser;
                }

                requestData = {
                    model: config.model,
                    messages: [
                        { role: "system", content: promptSystem },
                        { role: "user", content: userContent }
                    ],
                    temperature: 0.8
                };
            }
        };

        // Try with images first
        await buildRequest(hasImages);

        // Log detailed request info to console
        console.log('[X-AI-Reply] === API 请求详情 ===');
        console.log('[X-AI-Reply] URL:', url);
        console.log('[X-AI-Reply] Headers:', headers);
        console.log('[X-AI-Reply] Request Data:', JSON.stringify(requestData, null, 2));

        // API call function that can be retried
        const makeRequest = () => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let content = "";

                            if (config.requestFormat === 'anthropic') {
                                content = data.content?.[0]?.text || "";
                            } else if (config.requestFormat === 'gemini') {
                                content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else {
                                // OpenAI format - handle both direct and wrapped response
                                // Wrapped: {code: 0, data: {choices: [...]}}
                                // Direct: {choices: [...]}
                                const choices = data.data?.choices || data.choices;
                                content = choices?.[0]?.message?.content || "";
                            }

                            if (!content) {
                                reject('API 返回内容为空');
                                return;
                            }

                            // Parse multiple replies with optional translations
                            const rawReplies = content
                                .split(/---+/)
                                .map(r => r.trim())
                                .filter(r => r.length > 0 && r.length < 800);

                            // Extract reply and translation from each
                            const replies = rawReplies.map(raw => {
                                const translationMatch = raw.match(/\[翻译\]\s*(.+?)$/s);
                                if (translationMatch) {
                                    const reply = raw.replace(/\[翻译\]\s*.+$/s, '').trim();
                                    const translation = translationMatch[1].trim();
                                    return { reply, translation };
                                }
                                return { reply: raw, translation: null };
                            });

                            resolve(replies);
                        } catch (e) {
                            reject(`解析错误: ${e.message}`);
                        }
                    } else {
                        // Check if error is related to images/vision not supported
                        const errorText = response.responseText.toLowerCase();
                        if (hasImages && (
                            errorText.includes('image') ||
                            errorText.includes('vision') ||
                            errorText.includes('multimodal') ||
                            errorText.includes('not supported') ||
                            response.status === 400
                        )) {
                            reject({ retryWithoutImages: true, message: response.responseText });
                        } else {
                            reject(`HTTP ${response.status}: ${response.responseText.substring(0, 100)}`);
                        }
                    }
                },
                onerror: function (err) {
                    reject('网络错误');
                }
            });
        });

        // Try request, fallback to text-only if vision fails
        try {
            return await makeRequest();
        } catch (error) {
            if (error.retryWithoutImages) {
                console.log('Vision not supported, retrying without images...');
                await buildRequest(false);
                return await makeRequest();
            }
            throw error;
        }
    }

    // Streaming generation with real-time updates
    async function generateMultipleRepliesStream(tweetContent, style, lang, count, length, strategy, analysisResult, images, domain, onProgress) {
        if (!config.apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }

        const styleMap = {
            engage: '吸引人注意，增加互动和曝光，让人想点赞转发',
            humor: '幽默搞笑，轻松有趣',
            pro: '专业严谨，有深度',
            sharp: '犀利毒舌，观点独特',
            warm: '暖心治愈，温暖鼓励'
        };

        const langMap = {
            auto: '与原推文相同的语言',
            zh: '中文',
            en: 'English',
            ja: '日本語',
            ko: '한국어'
        };

        const lengthMap = {
            short: '简短精炼，不超过30字',
            medium: '适中长度，30-80字',
            long: '详细一些，80-150字'
        };

        const strategyMap = {
            default: '自然回复，根据推文内容自由发挥',
            agree: '赞同评论区的主流观点，表达共鸣和支持',
            unique: '提出独特的新观点或新角度，吸引关注',
            balance: '客观分析，提供平衡的多角度看法',
            challenge: '提出不同意见，友善地挑战主流观点'
        };

        let analysisContext = '';
        if (analysisResult) {
            if (analysisResult.summary) {
                analysisContext = `\n\n评论区热评总结：${analysisResult.summary}`;
            }
        }

        const hasImages = images && images.length > 0;
        const imageNote = hasImages ? '\n注意：推文包含图片，请结合图片内容生成回复。' : '';
        const needsTranslation = lang !== 'zh';
        const translationNote = needsTranslation ? '\n如果回复语言不是中文，请在每条回复后附加中文翻译，格式为：\n回复内容\n[翻译] 中文翻译' : '';

        // Domain context for streaming
        let domainContext = '';
        if (domain && domain !== 'general') {
            const domainInfo = getDomainById(domain);
            domainContext = `\n\n这是一条关于【${domainInfo.name}】领域的推文，请确保回复与该领域相关。`;
        }

        const learnedPatterns = getLearnedPatterns(domain);

        const promptSystem = `你是一个社交媒体高手，擅长写出吸引人的回复。
风格要求：${styleMap[style] || styleMap.engage}
语言要求：${langMap[lang] || langMap.auto}
字数要求：${lengthMap[length] || lengthMap.medium}
回复策略：${strategyMap[strategy] || strategyMap.default}
回复不要像机器人，要有个性和真实感。${domainContext}${learnedPatterns}${analysisContext}${imageNote}${translationNote}`;

        const promptUser = `请为以下推文生成 ${count} 条不同的回复，每条回复用 --- 分隔：

推文内容：${tweetContent || '[无文字，请根据图片内容回复]'}

请直接给出 ${count} 条回复，用 --- 分隔：`;

        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        // Build request based on provider
        if (config.requestFormat === 'anthropic') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 2048,
                stream: true,
                messages: [{ role: "user", content: promptSystem + "\n\n---\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            // Gemini uses different streaming endpoint
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
            requestData = {
                contents: [{ parts: [{ text: promptSystem + "\n\n" + promptUser }] }]
            };
        } else {
            // OpenAI compatible
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.8,
                stream: true
            };
        }

        return new Promise((resolve, reject) => {
            let fullContent = '';
            let lastProcessedLength = 0;

            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                responseType: 'text',
                onprogress: function (response) {
                    const newText = response.responseText.substring(lastProcessedLength);
                    lastProcessedLength = response.responseText.length;

                    // Parse SSE chunks
                    const lines = newText.split('\n');
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const jsonStr = line.substring(5).trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const data = JSON.parse(jsonStr);
                            let delta = '';

                            if (config.requestFormat === 'anthropic') {
                                delta = data.delta?.text || '';
                            } else if (config.requestFormat === 'gemini') {
                                delta = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            } else {
                                const streamChoices = data.data?.choices || data.choices;
                                delta = streamChoices?.[0]?.delta?.content || '';
                            }

                            if (delta) {
                                fullContent += delta;
                                if (onProgress) {
                                    onProgress(fullContent);
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                },
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        // Parse final content into replies
                        const rawReplies = fullContent
                            .split(/---+/)
                            .map(r => r.trim())
                            .filter(r => r.length > 0 && r.length < 800);

                        const replies = rawReplies.map(raw => {
                            const translationMatch = raw.match(/\[翻译\]\s*(.+?)$/s);
                            if (translationMatch) {
                                const reply = raw.replace(/\[翻译\]\s*.+$/s, '').trim();
                                const translation = translationMatch[1].trim();
                                return { reply, translation };
                            }
                            return { reply: raw, translation: null };
                        });

                        resolve(replies);
                    } else {
                        reject(`HTTP ${response.status}: ${response.responseText.substring(0, 100)}`);
                    }
                },
                onerror: function (err) {
                    reject('网络错误');
                }
            });
        });
    }

    // Check if text contains Chinese characters
    function containsChinese(text) {
        return /[\u4e00-\u9fff]/.test(text);
    }

    // Translate text to Chinese
    async function translateToChinese(text) {
        if (!config.apiKey || containsChinese(text)) {
            return null; // Skip if already Chinese
        }

        const promptSystem = "你是一个翻译专家。请将以下文本翻译成中文，只返回翻译结果，不要添加任何解释。";
        const promptUser = text;

        let url = "";
        let requestData = {};
        let headers = { "Content-Type": "application/json" };

        if (config.requestFormat === 'anthropic') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 500,
                messages: [{ role: "user", content: promptSystem + "\n\n---\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            requestData = {
                contents: [{ parts: [{ text: promptSystem + "\n\n" + promptUser }] }]
            };
        } else {
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.3
            };
        }

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let content = "";
                            if (config.requestFormat === 'anthropic') {
                                content = data.content?.[0]?.text || "";
                            } else if (config.requestFormat === 'gemini') {
                                content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                            } else {
                                const choices = data.data?.choices || data.choices;
                                content = choices?.[0]?.message?.content || "";
                            }
                            resolve(content.trim());
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // 2. Call LLM (kept for backward compatibility)
    async function generateReply(tweetContent) {
        if (!config.apiKey) {
            alert('Please set your API Key in Settings first!');
            return null;
        }

        const promptSystem = `You are a helpful social media assistant.
            Analyze the tweet (Language, Type) and write a reply in the SAME LANGUAGE.
            Persona: ${config.persona}.
            Keep it natural, concise, and engaging. No robot sound.`;

        const promptUser = `Context: "${tweetContent}"\n\nReply:`;

        let url = "";
        let requestData = {};
        let headers = {
            "Content-Type": "application/json"
        };

        if (config.requestFormat === 'anthropic') {
            // Anthropic API: baseUrl/v1/messages
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/messages`;
            headers["x-api-key"] = config.apiKey;
            headers["anthropic-version"] = "2023-06-01";
            requestData = {
                model: config.model,
                max_tokens: 1024,
                messages: [{ role: "user", content: promptSystem + "\n\n---\n\n" + promptUser }]
            };
        } else if (config.requestFormat === 'gemini') {
            // Gemini API: baseUrl/v1beta/models/{model}:generateContent
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            // Standard Google AI Studio uses key param in URL
            requestData = {
                contents: [{
                    parts: [{ text: promptSystem + "\n\n" + promptUser }]
                }]
            };
        } else {
            // OpenAI Compatible (default): baseUrl/v1/chat/completions
            url = `${config.apiBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
            headers["Authorization"] = `Bearer ${config.apiKey}`;
            requestData = {
                model: config.model,
                messages: [
                    { role: "system", content: promptSystem },
                    { role: "user", content: promptUser }
                ],
                temperature: 0.7
            };
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: headers,
                data: JSON.stringify(requestData),
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            let reply = "";

                            if (config.requestFormat === 'anthropic') {
                                if (data.content && data.content.length > 0) {
                                    reply = data.content[0].text;
                                }
                            } else if (config.requestFormat === 'gemini') {
                                if (data.candidates && data.candidates.length > 0) {
                                    const part = data.candidates[0].content.parts[0];
                                    reply = part.text || "";
                                }
                            } else {
                                // OpenAI - handle wrapped response
                                const choices = data.data?.choices || data.choices;
                                if (!choices || !choices.length) {
                                    reject('No choices returned from API');
                                    return;
                                }
                                const message = choices[0].message;
                                if (message.content) {
                                    reply = message.content;
                                } else {
                                    reject('API returned empty content. Partial: ' + JSON.stringify(message));
                                    return;
                                }
                            }

                            if (!reply) {
                                reject('Parsed reply is empty. Response: ' + response.responseText.substring(0, 200));
                                return;
                            }
                            resolve(reply.trim());
                        } catch (e) {
                            console.error("JSON Parse Error. Raw Response:", response.responseText);
                            reject(`JSON Parse Error: ${e.message}. \nRaw: ${response.responseText.substring(0, 100)}...`);
                        }
                    } else {
                        reject(`HTTP Error: ${response.status} - ${response.statusText}\n${response.responseText.substring(0, 200)}`);
                    }
                },
                onerror: function (err) {
                    reject('Network Error: ' + JSON.stringify(err));
                }
            });
        });
    }

    /* =========================================================================
     * MODULE 12: EDITOR OPERATIONS
     * =========================================================================
     * Insert text into reply editor, click send, and learning
     * ========================================================================= */

    async function insertTextIntoEditor(text) {
        // Wait for editor to appear
        let editor = document.querySelector('div[data-testid="tweetTextarea_0"]'); // Reply modal or inline
        let retries = 0;

        while (!editor && retries < 20) {
            await new Promise(r => setTimeout(r, 200));
            editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
            retries++;
        }

        if (!editor) {
            console.error('Editor not found');
            return false;
        }

        // Focus the editor
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

        // Method 1: Try execCommand first (works best with DraftJS)
        const success = document.execCommand('insertText', false, text);

        if (!success || editor.innerText.trim().length === 0) {
            // Method 2: Use clipboard API as fallback
            try {
                // Store original clipboard content
                const originalClipboard = await navigator.clipboard.readText().catch(() => '');

                // Write text to clipboard
                await navigator.clipboard.writeText(text);

                // Paste it
                document.execCommand('paste');

                // Restore original clipboard after a delay
                setTimeout(async () => {
                    if (originalClipboard) {
                        await navigator.clipboard.writeText(originalClipboard).catch(() => { });
                    }
                }, 100);
            } catch (e) {
                // Method 3: Direct text manipulation (last resort)
                const editableDiv = editor.querySelector('[contenteditable="true"]') || editor;
                if (editableDiv) {
                    editableDiv.textContent = text;
                    editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
                    editableDiv.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }

        // Dispatch events to ensure React/DraftJS picks up the change
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    // 4. Click Send and record for learning
    function clickSend() {
        const sendBtn = document.querySelector('button[data-testid="tweetButton"]');
        if (sendBtn) {
            // Try to capture final text for learning
            if (window._pendingReply) {
                const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
                if (editor) {
                    const finalText = editor.innerText.trim();
                    saveReplyToHistory(
                        window._pendingReply.original,
                        finalText,
                        window._pendingReply.tweetContext,
                        window._pendingReply.domain || 'general'
                    );
                }
                delete window._pendingReply;
            }
            sendBtn.click();
        }
    }

    // Monitor manual send clicks to capture learning data
    document.addEventListener('click', (e) => {
        const sendBtn = e.target.closest('button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]');
        if (sendBtn && window._pendingReply) {
            const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
            if (editor) {
                const finalText = editor.innerText.trim();
                saveReplyToHistory(
                    window._pendingReply.original,
                    finalText,
                    window._pendingReply.tweetContext,
                    window._pendingReply.domain || 'general'
                );
            }
            delete window._pendingReply;
        }
    }, true);

    /* =========================================================================
     * MODULE 13: INITIALIZATION
     * =========================================================================
     * Main interaction flow, button injection, and mutation observer
     * ========================================================================= */

    async function handleAiClick(tweetArticle, btnElement) {
        // Clear previous errors
        const prevError = tweetArticle.querySelector('.x-ai-error');
        if (prevError) prevError.remove();

        const text = getTweetText(tweetArticle);
        if (!text) {
            showError(tweetArticle, 'Could not find tweet text. Please try expanding the tweet first.');
            return;
        }

        const loader = showLoading(tweetArticle);

        try {
            const reply = await generateReply(text);

            if (!reply) return; // Error handled inside? No, generateReply rejects.

            // Open Reply Box
            const replyBtn = tweetArticle.querySelector('button[data-testid="reply"]');
            if (replyBtn) {
                replyBtn.click();

                // Wait a bit for animation
                await new Promise(r => setTimeout(r, 500));

                const success = await insertTextIntoEditor(reply);
                if (success && config.autoSend) {
                    // Wait a bit before sending for safety
                    await new Promise(r => setTimeout(r, 1000));
                    clickSend();
                }
            } else {
                console.error("Reply button not found");
                showError(tweetArticle, "Could not find reply button on this tweet.");
            }

        } catch (error) {
            console.error(error);
            showError(tweetArticle, error);
        } finally {
            removeLoading(loader);
        }
    }

    // --- Mutation Observer ---

    function addButtonToTweet(article) {
        if (article.dataset.aiReplyAdded) return;

        const actionBar = article.querySelector('div[role="group"]');
        if (!actionBar) return;

        // Create AI Reply button with icon + text
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin-left: 8px;
            color: #1d9bf0;
            transition: all 0.2s;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 500;
            gap: 4px;
        `;
        btnContainer.innerHTML = `<span style="font-size: 14px;">🤖</span><span>AI</span>`;
        btnContainer.title = "AI 智能回复";

        btnContainer.onmouseenter = () => {
            btnContainer.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
        };
        btnContainer.onmouseleave = () => {
            btnContainer.style.backgroundColor = 'transparent';
        };

        btnContainer.onclick = (e) => {
            e.stopPropagation();
            showOptionsPanel(article);
        };

        actionBar.appendChild(btnContainer);
        article.dataset.aiReplyAdded = "true";
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                articles.forEach(addButtonToTweet);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial check
    setTimeout(() => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(addButtonToTweet);
    }, 2000);

})();
