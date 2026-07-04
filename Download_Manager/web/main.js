window.onerror = function(message, source, lineno, colno, error) {
    const errText = message + " at " + source + ":" + lineno + ":" + colno + (error ? "\n" + error.stack : "");
    console.error(errText);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.log_js_error(errText);
    }
};

const urlInputs = document.getElementById('url-inputs');
// Drag‑and‑Drop support for URLs / text files
urlInputs.addEventListener('dragover', e => {
    e.preventDefault();
    urlInputs.classList.add('dragover');
});
urlInputs.addEventListener('dragleave', e => {
    e.preventDefault();
    urlInputs.classList.remove('dragover');
});
urlInputs.addEventListener('drop', e => {
    e.preventDefault();
    urlInputs.classList.remove('dragover');
    const dt = e.dataTransfer;
    // Text data (e.g., dragged URL)
    const textData = dt.getData('text');
    if (textData) {
        urlInputs.value = urlInputs.value ? urlInputs.value + '\n' + textData : textData;
        return;
    }
    // Files (e.g., .txt containing URLs)
    if (dt.files && dt.files.length) {
        const file = dt.files[0];
        const reader = new FileReader();
        reader.onload = ev => {
            const content = ev.target.result;
            urlInputs.value = urlInputs.value ? urlInputs.value + '\n' + content : content;
        };
        reader.readAsText(file);
    }
});
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnPauseText = document.getElementById('btn-pause-text');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');

// Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const chkDontShow = document.getElementById('chk-dont-show');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnClearConsole = document.getElementById('btn-clear-console');
const btnChangePath = document.getElementById('btn-change-path');
const lblDownloadPath = document.getElementById('lbl-download-path');
const queueList = document.getElementById('queue-list');
const queueEmptyState = document.getElementById('queue-empty-state');
const queueCountBadge = document.getElementById('queue-count');
const consoleBox = document.getElementById('console-box');
const engineStatusDot = document.getElementById('engine-status-dot');
const engineStatusText = document.getElementById('engine-status-text');
const navDownloads = document.getElementById('nav-downloads');
const navConsole = document.getElementById('nav-console');
const navHistory = document.getElementById('nav-history');
const contentGrid = document.querySelector('.content-grid');
const consoleSection = document.getElementById('console-section');
const historySection = document.getElementById('history-section');
const historyListBody = document.getElementById('history-list-body');
const btnClearHistory = document.getElementById('btn-clear-history');
const navCustomize = document.getElementById('nav-customize');
const customizeSection = document.getElementById('customize-section');
const btnResetTheme = document.getElementById('btn-reset-theme');
const navAbout = document.getElementById('nav-about');
const aboutSection = document.getElementById('about-section');
const pickPrimary = document.getElementById('pick-primary');
const pickSecondary = document.getElementById('pick-secondary');
const pickAccent = document.getElementById('pick-accent');
const pickBg = document.getElementById('pick-bg');
const hexPrimary = document.getElementById('hex-primary');
const hexSecondary = document.getElementById('hex-secondary');
const hexAccent = document.getElementById('hex-accent');
const hexBg = document.getElementById('hex-bg');

const queuePanelSection = document.getElementById('queue-panel-section');
const reorderListContainer = document.getElementById('reorder-list-container');
const reorderList = document.getElementById('reorder-list');

// YouTube Quality modal variables
const ytQualityModal = document.getElementById('yt-quality-modal');
const btnYtModalCancel = document.getElementById('btn-yt-modal-cancel');
const btnYtModalConfirm = document.getElementById('btn-yt-modal-confirm');
const selectModalYtQuality = document.getElementById('modal-yt-quality');

// Local application state
let queueItems = [];

// Helper to escape HTML to prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Generate a simple hash for URL to use as DOM element ID
function getUrlId(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = (hash << 5) - hash + url.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return 'url-' + Math.abs(hash);
}

// Update the queue count UI and handle empty state visibility
function updateQueueState() {
    queueCountBadge.textContent = `${queueItems.length} items`;
    if (queueItems.length === 0) {
        queueEmptyState.style.display = 'flex';
    } else {
        queueEmptyState.style.display = 'none';
    }
}

// Show the download queue panel and make grid 2 columns
function showQueuePanel() {
    if (queuePanelSection) {
        queuePanelSection.classList.remove('hidden');
    }
    if (contentGrid) {
        contentGrid.classList.remove('single-col');
    }
}

// Hide the download queue panel and make grid 1 column (full width input)
function hideQueuePanel() {
    if (queuePanelSection) {
        queuePanelSection.classList.add('hidden');
    }
    if (contentGrid) {
        contentGrid.classList.add('single-col');
    }
}



// Update the save location path label with parent drive disk metrics
async function updateDownloadPathDisplay(api, path) {
    try {
        const diskSpace = await api.get_disk_space();
        if (diskSpace && !diskSpace.error) {
            const freeText = formatBytes(diskSpace.free, 1);
            const totalText = formatBytes(diskSpace.total, 1);
            lblDownloadPath.textContent = `${path} (Free Space: ${freeText} of ${totalText})`;
        } else {
            lblDownloadPath.textContent = path;
        }
    } catch (err) {
        lblDownloadPath.textContent = path;
    }
}

// Re-render the entire queue based on text inputs
function parseAndBuildQueue() {
    const text = urlInputs.value;
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    // Show or hide reorder list based on whether there are URLs
    if (reorderListContainer) {
        if (lines.length > 0) {
            reorderListContainer.classList.remove('hidden');
            buildReorderList(lines);
        } else {
            reorderListContainer.classList.add('hidden');
            if (reorderList) {
                reorderList.innerHTML = '';
            }
        }
    }
    
    // Build new list preserving state of existing entries
    const existingItems = {};
    queueItems.forEach(item => {
        existingItems[item.url] = item;
    });

    queueItems = lines.map(url => {
        if (existingItems[url]) {
            return existingItems[url];
        }
        return {
            url: url,
            id: getUrlId(url),
            status: 'queued',
            filename: ''
        };
    });

    // Clear and redraw container
    const activeItems = queueList.querySelectorAll('.download-item');
    activeItems.forEach(el => el.remove());

    queueItems.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'download-item';
        itemEl.id = item.id;
        
        let statusClass = 'queued';
        let statusText = 'Queued';
        if (item.status === 'downloading' || item.status.includes('downloading')) {
            statusClass = 'running';
            statusText = item.status;
        } else if (item.status === 'completed' || item.status.toLowerCase() === 'completed') {
            statusClass = 'completed';
            statusText = 'Completed';
        } else if (item.status.includes('failed') || item.status.includes('error') || item.status.includes('fail')) {
            statusClass = 'failed';
            statusText = 'Failed';
        } else if (item.status && item.status !== 'queued') {
            statusClass = 'running';
            statusText = item.status;
        }

        itemEl.innerHTML = `
            <div class="download-item-header">
                <div style="display: flex; align-items: center; gap: 8px; max-width: 75%;">
                    <span class="queue-index-badge">${index + 1}</span>
                    <span class="download-url" title="${escapeHTML(item.url)}">${escapeHTML(item.url)}</span>
                </div>
                <span class="download-status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="download-item-body">
                <span class="download-filename">${item.filename || 'Pending...'}</span>
            </div>
            <div class="download-progress-container" style="display: none;">
                <div class="download-progress-bar-wrapper">
                    <div class="download-progress-bar" style="width: 0%;"></div>
                </div>
                <div class="download-progress-details">
                    <span class="download-speed">0 KB/s</span>
                    <span class="download-progress-text">0% (0 Bytes / 0 Bytes)</span>
                </div>
            </div>
        `;
        queueList.appendChild(itemEl);

        // Restore active progress graphics if item is downloading
        if (item.progress && (item.status === 'downloading' || item.status.includes('downloading'))) {
            const progressContainer = itemEl.querySelector('.download-progress-container');
            const progressBar = itemEl.querySelector('.download-progress-bar');
            const speedEl = itemEl.querySelector('.download-speed');
            const progressTextEl = itemEl.querySelector('.download-progress-text');
            if (progressContainer) progressContainer.style.display = 'flex';
            if (progressBar) progressBar.style.width = `${item.progress.percent}%`;
            if (speedEl) speedEl.textContent = formatSpeed(item.progress.speed);
            if (progressTextEl) {
                if (item.progress.total > 0) {
                    progressTextEl.textContent = `${item.progress.percent}% (${formatBytes(item.progress.received)} / ${formatBytes(item.progress.total)})`;
                } else {
                    progressTextEl.textContent = `${formatBytes(item.progress.received)}`;
                }
            }
        }
    });

    updateQueueState();
}

// Build the draggable reorder list below the paste box
let dragSrcEl = null;

function buildReorderList(lines) {
    reorderList.innerHTML = '';
    lines.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'reorder-item';
        item.draggable = true;
        item.dataset.index = index;
        item.innerHTML = `
            <span class="reorder-grip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>
            </span>
            <span class="reorder-index">${index + 1}</span>
            <span class="reorder-url" title="${escapeHTML(url)}">${escapeHTML(url)}</span>
        `;

        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        reorderList.appendChild(item);
    });
}

function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');

    if (dragSrcEl !== this) {
        const fromIndex = parseInt(dragSrcEl.dataset.index);
        const toIndex = parseInt(this.dataset.index);

        // Get current lines from textarea
        const lines = urlInputs.value.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        // Move the item
        const [moved] = lines.splice(fromIndex, 1);
        lines.splice(toIndex, 0, moved);

        // Write back and rebuild
        urlInputs.value = lines.join('\n');
        parseAndBuildQueue();
    }
}

function handleDragEnd() {
    this.classList.remove('dragging');
    reorderList.querySelectorAll('.reorder-item').forEach(item => {
        item.classList.remove('drag-over');
        item.classList.remove('dragging');
    });
}

// Helper to safely fetch the PyWebView Python API
async function getPythonApi() {
    if (window.pywebview && window.pywebview.api) {
        return window.pywebview.api;
    }
    return new Promise(resolve => {
        // Fallback polling to avoid race conditions if the ready event was already fired
        const interval = setInterval(() => {
            if (window.pywebview && window.pywebview.api) {
                clearInterval(interval);
                resolve(window.pywebview.api);
            }
        }, 15);

        window.addEventListener('pywebviewready', () => {
            clearInterval(interval);
            resolve(window.pywebview.api);
        });
    });
}

// Event Listeners
urlInputs.addEventListener('input', parseAndBuildQueue);

async function startQueueDownloads(urls) {
    showQueuePanel();
    js_log("System", `Starting downloads queue of ${urls.length} items...`);
    try {
        const api = await getPythonApi();
        const result = await api.start_downloads(urls, true);
        js_log("System", `Python engine feedback: ${result}`);
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
}

btnStart.addEventListener('click', async () => {
    parseAndBuildQueue(); // Run once more to ensure synchronized state
    if (queueItems.length === 0) {
        js_log("System", "Error: No links in the queue. Please paste links first.");
        return;
    }

    const urls = queueItems.map(item => item.url);
    const hasYoutube = urls.some(url => url.includes('youtube.com') || url.includes('youtu.be'));

    if (hasYoutube) {
        // Show quality select modal
        ytQualityModal.classList.remove('hidden');
    } else {
        await startQueueDownloads(urls);
    }
});

btnYtModalCancel.addEventListener('click', () => {
    ytQualityModal.classList.add('hidden');
});

btnYtModalConfirm.addEventListener('click', async () => {
    ytQualityModal.classList.add('hidden');
    const selectedQuality = selectModalYtQuality.value;
    try {
        const api = await getPythonApi();
        // Save the quality setting to backend config
        await api.save_config_value("yt_quality_default", selectedQuality);
        js_log("System", `Target YouTube quality set to: ${selectedQuality}`);
    } catch (e) {
        console.error("Failed to save YouTube quality selection:", e);
    }
    const urls = queueItems.map(item => item.url);
    await startQueueDownloads(urls);
});

btnPause.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        if (btnPauseText.textContent === "Pause Queue") {
            js_log("System", "Requesting engine to pause...");
            await api.pause_downloads();
        } else {
            js_log("System", "Requesting engine to resume...");
            await api.resume_downloads();
        }
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
});

const triggerStop = async () => {
    js_log("System", "Requesting engine to stop...");
    try {
        const api = await getPythonApi();
        await api.stop_downloads();
        await api.clear_temp_files();
    } catch (e) {
        js_log("Error", `Communication error: ${e.message}`);
    }
};

btnStop.addEventListener('click', () => {
    const hideWarning = appConfig.hide_stop_warning === true;
    if (hideWarning) {
        triggerStop();
    } else {
        if (chkDontShow) chkDontShow.checked = false;
        confirmModal.classList.remove('hidden');
    }
});

btnModalCancel.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    js_log("System", "Stop cancelled. Continuing downloads...");
});

btnModalConfirm.addEventListener('click', async () => {
    if (chkDontShow && chkDontShow.checked) {
        appConfig.hide_stop_warning = true;
        try {
            const api = await getPythonApi();
            await api.save_config_value('hide_stop_warning', true);
        } catch (e) {
            console.error("Failed to save stop warning config:", e);
        }
    }
    confirmModal.classList.add('hidden');
    await triggerStop();
});

btnClear.addEventListener('click', async () => {
    urlInputs.value = '';
    parseAndBuildQueue();
    
    // Hide queue panel and collapse grid back to full width input
    hideQueuePanel();
    
    js_log("System", "Queue cleared.");
    
    try {
        const api = await getPythonApi();
        await api.clear_temp_files();
    } catch (e) {
        console.error("Failed to clear temp files:", e);
    }
});

btnOpenFolder.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        await api.open_downloads_folder();
        js_log("System", "Opened downloads folder.");
    } catch (e) {
        js_log("Error", `Failed to open folder: ${e.message}`);
    }
});

btnChangePath.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        const newPath = await api.select_download_directory();
        if (newPath) {
            await updateDownloadPathDisplay(api, newPath);
            js_log("System", `Download destination set to: ${newPath}`);
        }
    } catch (e) {
        js_log("Error", `Failed to change directory: ${e.message}`);
    }
});
btnClearConsole.addEventListener('click', () => {
    consoleBox.innerHTML = '';
    js_log("System", "Console logs cleared.");
});

// Tab Switching Event Listeners
navDownloads.addEventListener('click', () => {
    navDownloads.classList.add('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    
    // Switch active containers with entry transitions
    contentGrid.classList.remove('hidden');
    contentGrid.classList.remove('fade-in');
    void contentGrid.offsetWidth; // Trigger reflow
    contentGrid.classList.add('fade-in');
    
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    
    // Ensure console is hidden in downloads dashboard tab
    consoleSection.classList.add('hidden');
    consoleSection.classList.remove('full-height');
});

navConsole.addEventListener('click', () => {
    navConsole.classList.add('active');
    navDownloads.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    consoleSection.classList.remove('hidden');
    
    consoleSection.classList.remove('full-height');
    consoleSection.classList.remove('fade-in');
    void consoleSection.offsetWidth; // Trigger reflow
    consoleSection.classList.add('full-height');
    consoleSection.classList.add('fade-in');
});

navHistory.addEventListener('click', () => {
    navHistory.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navCustomize.classList.remove('active');
    navAbout.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    
    historySection.classList.remove('hidden');
    historySection.classList.remove('fade-in');
    void historySection.offsetWidth; // Trigger reflow
    historySection.classList.add('fade-in');
    
    loadHistory();
});

navCustomize.addEventListener('click', () => {
    navCustomize.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navAbout.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    historySection.classList.add('hidden');
    aboutSection.classList.add('hidden');
    
    customizeSection.classList.remove('hidden');
    customizeSection.classList.remove('fade-in');
    void customizeSection.offsetWidth; // Trigger reflow
    customizeSection.classList.add('fade-in');
});

navAbout.addEventListener('click', () => {
    navAbout.classList.add('active');
    navDownloads.classList.remove('active');
    navConsole.classList.remove('active');
    navHistory.classList.remove('active');
    navCustomize.classList.remove('active');
    
    contentGrid.classList.add('hidden');
    consoleSection.classList.add('hidden');
    historySection.classList.add('hidden');
    customizeSection.classList.add('hidden');
    
    aboutSection.classList.remove('hidden');
    aboutSection.classList.remove('fade-in');
    void aboutSection.offsetWidth; // Trigger reflow
    aboutSection.classList.add('fade-in');
});

btnClearHistory.addEventListener('click', async () => {
    try {
        const api = await getPythonApi();
        await api.clear_history();
        await loadHistory();
    } catch (e) {
        console.error("Failed to clear history:", e);
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

const loadHistory = async () => {
    try {
        const api = await getPythonApi();
        const records = await api.get_history();
        
        historyListBody.innerHTML = '';
        if (records.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">No download history available.</td>`;
            historyListBody.appendChild(emptyRow);
            return;
        }
        
        records.forEach(r => {
            const row = document.createElement('tr');
            
            const cleanUrl = r.url || '';
            const shortUrl = cleanUrl.length > 50 ? cleanUrl.substring(0, 47) + '...' : cleanUrl;
            
            let badgeClass = 'cancelled';
            if (r.status.toLowerCase() === 'completed') {
                badgeClass = 'completed';
            } else if (r.status.toLowerCase() === 'deleted') {
                badgeClass = 'deleted';
            }
            
            row.innerHTML = `
                <td style="font-weight: 500; color: var(--text-main); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.filename)}</td>
                <td title="${escapeHtml(cleanUrl)}" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(shortUrl)}</td>
                <td>${escapeHtml(r.timestamp)}</td>
                <td><span class="status-badge ${badgeClass}">${escapeHtml(r.status)}</span></td>
            `;
            historyListBody.appendChild(row);
        });
    } catch (e) {
        console.error("Failed to load history:", e);
    }
};

// exposed javascript functions that PyWebView can evaluate
window.js_on_downloads_started = function() {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPauseText.textContent = "Pause Queue";
    btnStop.disabled = false;
    urlInputs.disabled = true;
    btnClear.disabled = true;
    btnChangePath.disabled = true;
    
    // Ensure the queue panel is visible with smooth grid transition
    showQueuePanel();
    
    engineStatusDot.className = 'pulse-dot running';
    engineStatusText.textContent = 'Engine: Downloading';
};

window.js_on_downloads_completed = function() {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPauseText.textContent = "Pause Queue";
    btnStop.disabled = true;
    urlInputs.disabled = false;
    btnClear.disabled = false;
    btnChangePath.disabled = false;
    
    engineStatusDot.className = 'pulse-dot idle';
    engineStatusText.textContent = 'Engine: Idle';
};

window.js_on_downloads_paused = function() {
    btnPauseText.textContent = "Resume Queue";
    engineStatusDot.className = 'pulse-dot paused';
    engineStatusText.textContent = 'Engine: Paused';
};

window.js_log = function(level, message) {
    const line = document.createElement('div');
    line.className = `console-line ${level.toLowerCase()}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Create timestamp element
    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = `[${timestamp}] `;
    
    // Create level tag element
    const tagSpan = document.createElement('span');
    tagSpan.className = `console-tag console-tag-${level.toLowerCase()}`;
    tagSpan.textContent = `[${level}] `;
    
    // Create message element
    const msgSpan = document.createElement('span');
    msgSpan.className = 'console-msg';
    msgSpan.textContent = message;
    
    line.appendChild(timeSpan);
    line.appendChild(tagSpan);
    line.appendChild(msgSpan);
    
    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
};

window.js_update_active_url = function(url, status, filename = null) {
    const id = getUrlId(url);
    const itemEl = document.getElementById(id);
    if (!itemEl) return;

    // Cache the status and filename changes inside the local state array
    const cachedItem = queueItems.find(item => item.url === url);
    if (cachedItem) {
        cachedItem.status = status;
        if (filename) {
            cachedItem.filename = filename;
        }
    }

    const badge = itemEl.querySelector('.download-status-badge');
    const filenameEl = itemEl.querySelector('.download-filename');
    const progressContainer = itemEl.querySelector('.download-progress-container');

    // Update status badge class and text
    badge.className = 'download-status-badge';
    let cleanStatus = status.toLowerCase();

    if (cleanStatus === 'completed') {
        badge.classList.add('completed');
        badge.textContent = 'Completed';
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    } else if (cleanStatus.includes('error') || cleanStatus.includes('failed') || cleanStatus.includes('timed out') || cleanStatus.includes('timeout')) {
        badge.classList.add('failed');
        badge.textContent = 'Failed';
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    } else {
        badge.classList.add('running');
        badge.textContent = status;
    }

    // Update filename if provided
    if (filename) {
        filenameEl.textContent = filename;
    }
};

// Formatter helper functions for file sizes and speeds
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    return formatBytes(bytesPerSec, 1) + '/s';
}

// Convert Hex to Rgba for primary glow highlights
function hexToRgbA(hex, alpha) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x' + c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255,107,107,${alpha})`;
}

// Global configuration cache
let appConfig = {};

// Color theme customization function
function applyCustomColors() {
    const primary = appConfig.custom_primary || '#ff6b6b';
    const secondary = appConfig.custom_secondary || '#4ecca3';
    const accent = appConfig.custom_accent || '#ffe66d';
    const bg = appConfig.custom_bg || '#0f0e17';
    
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--primary-glow', hexToRgbA(primary, 0.2));
    document.documentElement.style.setProperty('--secondary', secondary);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--bg-dark', bg);
    
    if (pickPrimary) pickPrimary.value = primary;
    if (pickSecondary) pickSecondary.value = secondary;
    if (pickAccent) pickAccent.value = accent;
    if (pickBg) pickBg.value = bg;
    
    if (hexPrimary) hexPrimary.textContent = primary.toUpperCase();
    if (hexSecondary) hexSecondary.textContent = secondary.toUpperCase();
    if (hexAccent) hexAccent.textContent = accent.toUpperCase();
    if (hexBg) hexBg.textContent = bg.toUpperCase();
}

// Set up event listeners for inputs
if (pickPrimary) {
    pickPrimary.addEventListener('input', (e) => {
        appConfig.custom_primary = e.target.value;
        applyCustomColors();
    });
}
if (pickSecondary) {
    pickSecondary.addEventListener('input', (e) => {
        appConfig.custom_secondary = e.target.value;
        applyCustomColors();
    });
}
if (pickAccent) {
    pickAccent.addEventListener('input', (e) => {
        appConfig.custom_accent = e.target.value;
        applyCustomColors();
    });
}
if (pickBg) {
    pickBg.addEventListener('input', (e) => {
        appConfig.custom_bg = e.target.value;
        applyCustomColors();
    });
}

const btnSaveTheme = document.getElementById('btn-save-theme');
if (btnSaveTheme) {
    btnSaveTheme.addEventListener('click', async () => {
        try {
            const api = await getPythonApi();
            await api.save_config_value('custom_primary', appConfig.custom_primary || null);
            await api.save_config_value('custom_secondary', appConfig.custom_secondary || null);
            await api.save_config_value('custom_accent', appConfig.custom_accent || null);
            await api.save_config_value('custom_bg', appConfig.custom_bg || null);
            
            js_log("System", "Theme changes saved successfully to configuration.");
            
            const originalText = btnSaveTheme.textContent;
            btnSaveTheme.textContent = "Saved!";
            btnSaveTheme.style.background = "var(--secondary)";
            btnSaveTheme.style.color = "#000";
            setTimeout(() => {
                btnSaveTheme.textContent = originalText;
                btnSaveTheme.style.background = "";
                btnSaveTheme.style.color = "";
            }, 1500);
        } catch (e) {
            console.error("Failed to save custom colors:", e);
            js_log("Error", "Failed to save theme changes.");
        }
    });
}

if (btnResetTheme) {
    btnResetTheme.addEventListener('click', async () => {
        delete appConfig.custom_primary;
        delete appConfig.custom_secondary;
        delete appConfig.custom_accent;
        delete appConfig.custom_bg;
        
        applyCustomColors();
        js_log("System", "Theme colors reset to default Coral & Mint.");
        
        const api = await getPythonApi();
        await api.save_config_value('custom_primary', null);
        await api.save_config_value('custom_secondary', null);
        await api.save_config_value('custom_accent', null);
        await api.save_config_value('custom_bg', null);
    });
}

// JS callback for real-time progress update
window.js_update_download_progress = function(url, state, percent, speed, received, total) {
    const id = getUrlId(url);
    const itemEl = document.getElementById(id);
    if (!itemEl) return;

    // Cache active progress metrics in local state array
    const cachedItem = queueItems.find(item => item.url === url);
    if (cachedItem) {
        cachedItem.status = state;
        cachedItem.progress = { percent, speed, received, total };
    }

    const badge = itemEl.querySelector('.download-status-badge');
    const progressContainer = itemEl.querySelector('.download-progress-container');
    const progressBar = itemEl.querySelector('.download-progress-bar');
    const speedEl = itemEl.querySelector('.download-speed');
    const progressTextEl = itemEl.querySelector('.download-progress-text');

    if (progressContainer && progressContainer.style.display === 'none') {
        progressContainer.style.display = 'flex';
    }

    if (badge) {
        badge.className = 'download-status-badge running';
        badge.textContent = percent > 0 ? `Downloading ${percent}%` : 'Downloading';
    }

    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }

    if (speedEl) {
        speedEl.textContent = formatSpeed(speed);
    }

    if (progressTextEl) {
        if (total > 0) {
            progressTextEl.textContent = `${percent}% (${formatBytes(received)} / ${formatBytes(total)})`;
        } else {
            progressTextEl.textContent = `${formatBytes(received)}`;
        }
    }
};



// About Section Links & Buttons External Browser Redirection
const linkLinkedin = document.getElementById('link-linkedin');
const btnGithub = document.getElementById('btn-github');

if (linkLinkedin) {
    linkLinkedin.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const api = await getPythonApi();
            await api.open_external_url('https://www.linkedin.com/in/jeelpandya03');
        } catch (err) {
            console.error("Failed to open LinkedIn:", err);
        }
    });
}

if (btnGithub) {
    btnGithub.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const api = await getPythonApi();
            await api.open_external_url('https://github.com/error404JPnotfound');
        } catch (err) {
            console.error("Failed to open GitHub:", err);
        }
    });
}


// Initial load configuration
async function initializeApp() {
    // Hide queue panel initially
    hideQueuePanel();

    const splashScreen = document.getElementById('splash-screen');
    const splashStatus = splashScreen ? splashScreen.querySelector('.splash-status') : null;

    // Status updates during loading
    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "Connecting to backend...";
    }, 1500);

    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "Syncing configurations...";
    }, 3500);

    // Hide splash screen after 5 seconds
    setTimeout(() => {
        if (splashStatus) splashStatus.textContent = "Ready!";
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
        }
    }, 5000);

    let api = null;
    try {
        api = await getPythonApi();
    } catch (e) {
        console.error("Failed to acquire Python API:", e);
    }

    if (api) {
        // 1. Fetch Configuration
        try {
            appConfig = (await api.get_config()) || {};
        } catch (e) {
            console.error("Failed to load appConfig:", e);
        }

        // 2. Theme colors initialization based on config
        try {
            applyCustomColors();
        } catch (e) {
            console.error("Failed to initialize theme colors:", e);
        }

        // 4. Ensure console section is hidden by default
        try {
            consoleSection.classList.add('hidden');
        } catch (e) {
            console.error("Failed to hide console:", e);
        }

        // 5. Load and display Download Directory path
        try {
            const currentPath = await api.get_download_directory();
            await updateDownloadPathDisplay(api, currentPath);
        } catch (e) {
            console.error("Failed to display download directory path:", e);
        }
    } else {
        // Fallback default setup
        applyCustomColors();
        consoleSection.classList.add('hidden');
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Stubs to absorb legacy python callbacks safely
window.js_init_yt_playlist = () => {};
window.js_update_yt_playlist_item = () => {};
window.js_update_yt_progress = () => {};
