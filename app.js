"use strict";
// =====================================================
// LexaRead — app.ts
// Page-by-page PDF reader with professional TTS
// =====================================================
class LexaDB {
    constructor() {
        this.dbName = 'LexaReadDB';
        this.dbVer = 1;
        this.db = null;
    }
    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVer);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('books')) {
                    db.createObjectStore('books', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('progress')) {
                    db.createObjectStore('progress', { keyPath: 'bookId' });
                }
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => { this.db = req.result; resolve(); };
            req.onerror = () => reject(req.error);
        });
    }
    async saveBook(book) {
        return this.tx('books', 'readwrite', store => store.put(book));
    }
    async getBook(id) {
        return this.tx('books', 'readonly', store => store.get(id));
    }
    async getAllBooks() {
        return this.tx('books', 'readonly', store => store.getAll());
    }
    async deleteBook(id) {
        await this.tx('books', 'readwrite', store => store.delete(id));
        await this.tx('progress', 'readwrite', store => store.delete(id));
        await this.tx('notes', 'readwrite', store => store.delete(`${id}-note`));
    }
    async saveProgress(prog) {
        return this.tx('progress', 'readwrite', store => store.put(prog));
    }
    async getProgress(bookId) {
        return this.tx('progress', 'readonly', store => store.get(bookId));
    }
    async saveNote(note) {
        return this.tx('notes', 'readwrite', store => store.put(note));
    }
    async getNote(id) {
        return this.tx('notes', 'readonly', store => store.get(id));
    }
    async getAllNotes() {
        return this.tx('notes', 'readonly', store => store.getAll());
    }
    async deleteNote(id) {
        return this.tx('notes', 'readwrite', store => store.delete(id));
    }
    tx(storeName, mode, op) {
        return new Promise((resolve, reject) => {
            if (!this.db)
                return reject(new Error('DB not initialized'));
            const tx = this.db.transaction(storeName, mode);
            const req = op(tx.objectStore(storeName));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
}
const localDb = new LexaDB();
// ── Abbreviation map ─────────────────────────────────
const ABBREVS = {
    Dr: 'Doctor', Mr: 'Mister', Mrs: 'Missus', Ms: 'Miss',
    Prof: 'Professor', Sr: 'Senior', Jr: 'Junior',
    Fig: 'Figure', vs: 'versus', etc: 'etcetera',
    approx: 'approximately', dept: 'department',
    avg: 'average', max: 'maximum', min: 'minimum',
    Corp: 'Corporation', Inc: 'Incorporated', Ltd: 'Limited',
    Jan: 'January', Feb: 'February', Mar: 'March',
    Apr: 'April', Aug: 'August', Sep: 'September',
    Oct: 'October', Nov: 'November', Dec: 'December',
};
// ── Text pre-processor ───────────────────────────────
// Transforms raw PDF text so TTS sounds professional:
//  1. ALL-CAPS words → lowercase (so "PDF" → reads as "pee dee eff", not "P-D-F")
//  2. Symbols → words
//  3. Abbreviations → full words
//  4. Units → readable form
//  5. Punctuation normalisation
function preprocessForTTS(raw) {
    if (!raw.trim())
        return '';
    let t = raw;
    // Symbols → words
    t = t.replace(/&amp;/g, ' and ').replace(/&/g, ' and ');
    t = t.replace(/\$/g, ' dollars ').replace(/€/g, ' euros ').replace(/£/g, ' pounds ');
    t = t.replace(/%/g, ' percent ');
    t = t.replace(/@/g, ' at ');
    t = t.replace(/©/g, ' copyright ').replace(/®/g, ' registered ').replace(/™/g, '');
    t = t.replace(/\+(?!\d)/g, ' plus ').replace(/=/g, ' equals ');
    t = t.replace(/>/g, ' greater than ').replace(/</g, ' less than ');
    t = t.replace(/\//g, ' slash ');
    // ALL-CAPS words → lowercase so TTS reads them as words, not letters
    // "NASA" → "nasa" (TTS: "nasa"), "PDF" → "pdf" (TTS: "pee dee eff")
    // "THE" → "the", "INTRODUCTION" → "introduction"
    t = t.replace(/\b([A-Z]{2,})\b/g, (m) => m.toLowerCase());
    // Abbreviations with trailing dot: "Dr." → "Doctor"
    for (const [abbr, full] of Object.entries(ABBREVS)) {
        t = t.replace(new RegExp(`\\b${abbr}\\.`, 'g'), full + ' ');
    }
    // Common units
    t = t.replace(/(\d+)\s*°C/g, '$1 degrees Celsius');
    t = t.replace(/(\d+)\s*°F/g, '$1 degrees Fahrenheit');
    t = t.replace(/(\d+)\s*(?:kg)\b/g, '$1 kilograms');
    t = t.replace(/(\d+)\s*(?:km)\b/g, '$1 kilometers');
    t = t.replace(/(\d+)\s*(?:cm)\b/g, '$1 centimeters');
    t = t.replace(/(\d+)\s*(?:mm)\b/g, '$1 millimeters');
    t = t.replace(/(\d+)\s*(?:GHz)\b/g, '$1 gigahertz');
    t = t.replace(/(\d+)\s*(?:MHz)\b/g, '$1 megahertz');
    t = t.replace(/(\d+)\s*(?:GB)\b/g, '$1 gigabytes');
    t = t.replace(/(\d+)\s*(?:MB)\b/g, '$1 megabytes');
    t = t.replace(/(\d+)\s*(?:KB)\b/g, '$1 kilobytes');
    t = t.replace(/(\d+)\s*(?:ms)\b/g, '$1 milliseconds');
    // Ordinals: "1st" "2nd" "3rd" "4th"
    t = t.replace(/\b(\d+)st\b/g, '$1st');
    t = t.replace(/\b(\d+)nd\b/g, '$1nd');
    t = t.replace(/\b(\d+)rd\b/g, '$1rd');
    t = t.replace(/\b(\d+)th\b/g, '$1th');
    // Dashes → pause via comma
    t = t.replace(/[—–]/g, ', ');
    // Ellipsis normalise
    t = t.replace(/\.{2,}/g, '. ');
    // Remove URLs
    t = t.replace(/https?:\/\/\S+/g, 'link');
    // Ensure space after punctuation (e.g. "word.Next" → "word. Next")
    t = t.replace(/([.!?,:;])([^\s\d"')\]])/g, '$1 $2');
    // Strip stray bullet characters
    t = t.replace(/^[\s\-\u2022\u2013\u2014\*]+/gm, '');
    // Collapse multiple spaces
    t = t.replace(/\s{2,}/g, ' ');
    return t.trim();
}
// ── DOM refs ─────────────────────────────────────────
function byId(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element #${id} not found in DOM. This may be due to a stale cache.`);
        return document.createElement('div');
    }
    return el;
}
const dom = {
    sidebar: byId('sidebar'),
    backdrop: byId('sidebarBackdrop'),
    sidebarToggle: byId('sidebarToggleBtn'),
    sidebarCloseBtn: byId('sidebarCloseBtn'),
    dropZone: byId('dropZone'),
    fileInput: byId('fileInput'),
    bookInfo: byId('bookInfo'),
    bookName: byId('bookName'),
    bookPages: byId('bookPages'),
    closeBookBtn: byId('closeBookBtn'),
    thumbHeader: byId('thumbHeader'),
    thumbList: byId('thumbList'),
    themeBtn: byId('themeBtn'),
    themeIcon: byId('themeIcon'),
    themeLabel: byId('themeLabel'),
    pageNav: byId('pageNav'),
    prevPage: byId('prevPage'),
    nextPage: byId('nextPage'),
    pageInput: byId('pageInput'),
    totalPages: byId('totalPages'),
    zoomCtrl: byId('zoomCtrl'),
    zoomIn: byId('zoomIn'),
    zoomOut: byId('zoomOut'),
    zoomVal: byId('zoomVal'),
    fitPage: byId('fitPage'),
    welcome: byId('welcome'),
    loader: byId('loader'),
    loaderMsg: byId('loaderMsg'),
    pageContainer: byId('pageContainer'),
    pageWrap: byId('pageWrap'),
    pdfCanvas: byId('pdfCanvas'),
    textLayer: byId('textLayer'),
    viewerWrap: byId('viewerWrap'),
    voiceSel: byId('voiceSel'),
    playBtn: byId('playBtn'),
    stopBtn: byId('stopBtn'),
    skipBack: byId('skipBack'),
    skipFwd: byId('skipFwd'),
    spdDn: byId('spdDn'),
    spdUp: byId('spdUp'),
    spdVal: byId('spdVal'),
    pitchSlider: byId('pitchSlider'),
    autoBtn: byId('autoBtn'),
    progFill: byId('progFill'),
    progLbl: byId('progLbl'),
    progPct: byId('progPct'),
    swipeHint: byId('swipeHint'),
    // New
    fullScreenBtn: byId('fullScreenBtn'),
    notePrompt: byId('notePrompt'),
    addNoteBtn: byId('addNoteBtn'),
    navLibList: byId('navLibList'),
    navNoteList: byId('navNoteList'),
    waterCanvas: byId('waterCanvas'),
};
// ── Full Screen ──────────────────────────────────────────
dom.fullScreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            toast(`Error entering full screen: ${err.message}`, 'err');
        });
    }
    else {
        document.exitFullscreen();
    }
});
document.addEventListener('fullscreenchange', () => {
    const isFS = !!document.fullscreenElement;
    dom.fullScreenBtn.classList.toggle('active', isFS);
    dom.fullScreenBtn.innerHTML = isFS ?
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14v5a2 2 0 002 2h5m11-11V5a2 2 0 00-2-2h-5M4 10V5a2 2 0 012-2h5m11 11v5a2 2 0 01-2 2h-5"/></svg>` :
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`;
});
// ── Selection Detection (Note Taking) ───────────────────
let selectedText = '';
function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !dom.textLayer.contains(sel.anchorNode)) {
        dom.notePrompt.style.display = 'none';
        selectedText = '';
        return;
    }
    const text = sel.toString().trim();
    if (text.length < 2) {
        dom.notePrompt.style.display = 'none';
        return;
    }
    selectedText = text;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const parentRect = dom.viewerWrap.getBoundingClientRect();
    dom.notePrompt.style.display = 'block';
    // Position relative to viewerWrap (which is position:relative)
    const left = rect.left - parentRect.left + dom.viewerWrap.scrollLeft + (rect.width / 2) - (dom.notePrompt.offsetWidth / 2);
    const top = rect.top - parentRect.top + dom.viewerWrap.scrollTop - 45;
    dom.notePrompt.style.left = `${left}px`;
    dom.notePrompt.style.top = `${top}px`;
}
document.addEventListener('mouseup', () => setTimeout(handleSelection, 10));
document.addEventListener('touchend', () => setTimeout(handleSelection, 10));
dom.addNoteBtn.addEventListener('click', async () => {
    if (!currentBookId || !selectedText)
        return;
    const noteId = `${currentBookId}-note`;
    let existing = await localDb.getNote(noteId);
    if (existing) {
        existing.content += '\n\n' + selectedText;
        existing.updatedAt = Date.now();
        await localDb.saveNote(existing);
        toast('Added to existing note!', 'ok');
    }
    else {
        await localDb.saveNote({
            id: noteId,
            bookId: currentBookId,
            title: `${bookTitle} Notes`,
            content: selectedText,
            updatedAt: Date.now()
        });
        toast('New note created!', 'ok');
    }
    window.getSelection()?.removeAllRanges();
    dom.notePrompt.style.display = 'none';
    refreshLibrary(); // Refresh navbar to show notes
});
// ── State ─────────────────────────────────────────────
let pdf = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
let bookTitle = '';
let currentBookId = '';
let renderTask = null;
let items = [];
let pageFullText = '';
let isSpeaking = false;
let isPaused = false;
let rate = 1.0;
let pitch = 1.0;
let voice = null;
let autoAdvance = true;
let currentItemIdx = -1;
let ttsKeepAlive = null;
let wakeLock = null;
// ── Wake Lock ─────────────────────────────────────────
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    }
    catch (err) {
        console.warn('Wake lock failed:', err);
    }
}
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => { });
        wakeLock = null;
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSpeaking && !isPaused) {
        requestWakeLock();
    }
    else if (document.visibilityState === 'hidden') {
        releaseWakeLock();
    }
});
// ── Toast ─────────────────────────────────────────────
function toast(msg, type = 'info', ms = 2600) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'toast-wrap';
        document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    const icon = type === 'ok' ? '✅' : type === 'err' ? '❌' : 'ℹ️';
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    wrap.appendChild(t);
    setTimeout(() => {
        t.style.cssText += 'opacity:0;transform:translateX(16px);transition:.25s ease';
        setTimeout(() => t.remove(), 270);
    }, ms);
}
// ── Theme ─────────────────────────────────────────────
function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    dom.themeIcon.textContent = t === 'dark' ? '🌙' : '☀️';
    dom.themeLabel.textContent = t === 'dark' ? 'Dark Mode' : 'Light Mode';
    localStorage.setItem('lexa-theme', t);
}
applyTheme(localStorage.getItem('lexa-theme') ?? 'light');
dom.themeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
// ── Sidebar ───────────────────────────────────────────
const DESKTOP_BP = 900;
function openSidebar() {
    dom.sidebar.classList.add('open');
    if (window.innerWidth < DESKTOP_BP) {
        dom.backdrop.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }
}
function closeSidebar() {
    dom.sidebar.classList.remove('open');
    dom.backdrop.classList.remove('visible');
    document.body.style.overflow = '';
}
function toggleSidebar() {
    if (dom.sidebar.classList.contains('open'))
        closeSidebar();
    else
        openSidebar();
}
// On desktop, sidebar starts open; on mobile, starts closed
if (window.innerWidth >= DESKTOP_BP)
    openSidebar();
dom.sidebarToggle.addEventListener('click', toggleSidebar);
dom.sidebarCloseBtn.addEventListener('click', closeSidebar);
dom.backdrop.addEventListener('click', closeSidebar);
// Close sidebar when a thumbnail is tapped on mobile
dom.thumbList.addEventListener('click', () => {
    if (window.innerWidth < DESKTOP_BP)
        closeSidebar();
});
window.addEventListener('resize', () => {
    if (window.innerWidth >= DESKTOP_BP) {
        openSidebar();
        dom.backdrop.classList.remove('visible');
        document.body.style.overflow = '';
    }
});
dom.closeBookBtn.addEventListener('click', () => {
    if (!currentBookId)
        return;
    // Add 3D spin class
    dom.closeBookBtn.classList.add('spin-3d');
    // Wait for animation then close
    setTimeout(() => {
        stopTTS();
        if (pdf) {
            try {
                pdf.destroy();
            }
            catch (err) { }
            pdf = null;
        }
        currentBookId = '';
        showWelcome();
        dom.bookInfo.style.display = 'none';
        dom.thumbHeader.style.display = 'none';
        dom.pageNav.style.display = 'none';
        dom.zoomCtrl.style.display = 'none';
        dom.thumbList.innerHTML = '';
        enableControls(false);
        refreshLibrary(); // Update active state in list
        // Remove class for next time
        dom.closeBookBtn.classList.remove('spin-3d');
    }, 600);
});
// ── Voices ────────────────────────────────────────────
function loadVoices() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length)
        return;
    const currentVal = dom.voiceSel.value;
    dom.voiceSel.innerHTML = '';
    voices.forEach((v, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${v.name} (${v.lang})`;
        dom.voiceSel.appendChild(o);
    });
    if (currentBookId && currentVal !== 'Loading…' && currentVal !== '') {
        dom.voiceSel.value = currentVal;
    }
    else {
        const pref = voices.findIndex(v => v.lang.startsWith('en') &&
            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Samantha')));
        dom.voiceSel.value = String(pref >= 0 ? pref : 0);
    }
    voice = voices[Number(dom.voiceSel.value)];
}
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
dom.voiceSel.addEventListener('change', () => {
    voice = speechSynthesis.getVoices()[Number(dom.voiceSel.value)];
    if (isSpeaking)
        restartTTS();
});
// ── File upload ────────────────────────────────────────
dom.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    const f = e.dataTransfer?.files[0];
    if (f)
        openFile(f);
});
dom.fileInput.addEventListener('change', () => { const f = dom.fileInput.files?.[0]; if (f)
    openFile(f); });
async function generateCover(targetPdf) {
    try {
        const page = await targetPdf.getPage(1);
        const vp = page.getViewport({ scale: 0.25 });
        const c = document.createElement('canvas');
        c.width = vp.width;
        c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        return c.toDataURL('image/jpeg', 0.8);
    }
    catch (err) {
        console.warn('Cover gen failed:', err);
        return '';
    }
}
async function openFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast('Only PDF files supported.', 'err');
        return;
    }
    stopTTS();
    showLoader('Loading PDF…');
    bookTitle = file.name.replace(/\.pdf$/i, '');
    currentBookId = `${file.name}-${file.size}`;
    try {
        if (pdf) {
            try {
                pdf.destroy();
            }
            catch (err) {
                console.warn('Failed to destroy old PDF:', err);
            }
        }
        const buf = await file.arrayBuffer();
        // Clone the buffer because PDF.js takes ownership of it (detaches it)
        const bufForDb = buf.slice(0);
        pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        totalPages = pdf.numPages;
        currentPage = 1;
        // Persist
        const thumb = await generateCover(pdf);
        await localDb.saveBook({
            id: currentBookId,
            title: bookTitle,
            data: bufForDb,
            thumbnail: thumb,
            totalPages,
            addedAt: Date.now()
        });
        const prog = await localDb.getProgress(currentBookId);
        if (prog) {
            currentPage = prog.lastPage;
            rate = prog.rate || 1.0;
            pitch = prog.pitch || 1.0;
            scale = prog.zoom || 1.5;
            dom.spdVal.textContent = rate.toFixed(1) + '×';
            dom.pitchSlider.value = String(pitch);
            dom.zoomVal.textContent = Math.round((scale / 1.5) * 100) + '%';
            if (!isNaN(prog.voiceIdx) && dom.voiceSel.options.length > 1 && prog.voiceIdx < dom.voiceSel.options.length) {
                dom.voiceSel.value = String(prog.voiceIdx);
                voice = speechSynthesis.getVoices()[prog.voiceIdx];
            }
        }
        dom.bookName.textContent = bookTitle;
        dom.bookPages.textContent = `${totalPages} page${totalPages !== 1 ? 's' : ''}`;
        dom.bookInfo.style.display = '';
        dom.thumbHeader.style.display = '';
        dom.pageNav.style.display = '';
        dom.zoomCtrl.style.display = '';
        dom.totalPages.textContent = String(totalPages);
        dom.pageInput.max = String(totalPages);
        enableControls(true);
        generateThumbnails();
        refreshLibrary();
        await renderPage(currentPage);
        toast(`"${bookTitle}" loaded!`, 'ok');
        if (window.innerWidth < 640) {
            dom.swipeHint.style.display = '';
            setTimeout(() => { dom.swipeHint.style.display = 'none'; }, 3500);
        }
    }
    catch (err) {
        toast('Failed to open PDF: ' + err.message, 'err');
        showWelcome();
    }
}
async function saveCurrentProgress() {
    if (!currentBookId)
        return;
    await localDb.saveProgress({
        bookId: currentBookId,
        lastPage: currentPage,
        zoom: scale,
        voiceIdx: Number(dom.voiceSel.value),
        rate: rate,
        pitch: pitch,
        lastRead: Date.now()
    });
}
async function refreshLibrary() {
    const books = await localDb.getAllBooks();
    const notes = await localDb.getAllNotes();
    // Render Books
    dom.navLibList.innerHTML = '';
    books.sort((a, b) => b.addedAt - a.addedAt);
    for (const b of books) {
        const item = document.createElement('div');
        item.className = `nav-item${b.id === currentBookId ? ' active' : ''}`;
        item.innerHTML = `
      <img src="${b.thumbnail || ''}" class="nav-thumb" alt="cover"/>
      <div class="nav-title">${b.title}</div>
      <button class="lib-del" title="Remove">✕</button>
    `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('lib-del'))
                return;
            if (b.id !== currentBookId)
                loadFromLibrary(b.id);
        });
        item.querySelector('.lib-del')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${b.title}" from library?`)) {
                await localDb.deleteBook(b.id);
                if (b.id === currentBookId) {
                    pdf?.destroy();
                    pdf = null;
                    currentBookId = '';
                    showWelcome();
                    dom.bookInfo.style.display = 'none';
                    dom.thumbHeader.style.display = 'none';
                    dom.pageNav.style.display = 'none';
                    dom.zoomCtrl.style.display = 'none';
                    dom.thumbList.innerHTML = '';
                    enableControls(false);
                }
                refreshLibrary();
            }
        });
        dom.navLibList.appendChild(item);
    }
    // Render Notes
    dom.navNoteList.innerHTML = '';
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const n of notes) {
        const item = document.createElement('div');
        item.className = 'nav-item note-item';
        item.innerHTML = `
      <div class="nav-icon">📝</div>
      <div class="nav-title">${n.title}</div>
      <button class="lib-del" title="Delete">✕</button>
    `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('lib-del'))
                return;
            showNoteContent(n);
        });
        item.querySelector('.lib-del')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete notes for "${n.title}"?`)) {
                await localDb.deleteNote(n.id);
                refreshLibrary();
            }
        });
        dom.navNoteList.appendChild(item);
    }
}
function showNoteContent(note) {
    // Simple overlay for viewing notes
    let overlay = document.querySelector('.note-view-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'note-view-overlay';
        overlay.innerHTML = `
      <div class="note-view-content">
        <div class="note-view-header">
          <h2 id="noteViewTitle"></h2>
          <button id="closeNoteView">✕</button>
        </div>
        <div class="note-view-body" id="noteViewBody" style="white-space: pre-wrap;"></div>
      </div>
    `;
        document.body.appendChild(overlay);
        overlay.querySelector('#closeNoteView')?.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    }
    overlay.querySelector('#noteViewTitle').textContent = note.title;
    overlay.querySelector('#noteViewBody').textContent = note.content;
    overlay.style.display = 'flex';
}
async function loadFromLibrary(id) {
    stopTTS();
    showLoader('Opening book…');
    try {
        const b = await localDb.getBook(id);
        if (!b)
            throw new Error('Book data missing');
        bookTitle = b.title;
        currentBookId = b.id;
        if (pdf) {
            try {
                pdf.destroy();
            }
            catch (e) { }
        }
        pdf = await pdfjsLib.getDocument({ data: b.data }).promise;
        totalPages = pdf.numPages;
        const prog = await localDb.getProgress(id);
        if (prog) {
            currentPage = prog.lastPage;
            rate = prog.rate || 1.0;
            pitch = prog.pitch || 1.0;
            scale = prog.zoom || 1.5;
            dom.spdVal.textContent = rate.toFixed(1) + '×';
            dom.pitchSlider.value = String(pitch);
            dom.zoomVal.textContent = Math.round((scale / 1.5) * 100) + '%';
            if (!isNaN(prog.voiceIdx) && dom.voiceSel.options.length > 1 && prog.voiceIdx < dom.voiceSel.options.length) {
                dom.voiceSel.value = String(prog.voiceIdx);
                voice = speechSynthesis.getVoices()[prog.voiceIdx];
            }
        }
        else {
            currentPage = 1;
            scale = 1.5;
            dom.zoomVal.textContent = '100%';
        }
        dom.bookName.textContent = bookTitle;
        dom.bookPages.textContent = `${totalPages} page${totalPages !== 1 ? 's' : ''}`;
        dom.bookInfo.style.display = '';
        dom.thumbHeader.style.display = '';
        dom.pageNav.style.display = '';
        dom.zoomCtrl.style.display = '';
        dom.totalPages.textContent = String(totalPages);
        dom.pageInput.max = String(totalPages);
        enableControls(true);
        generateThumbnails();
        refreshLibrary();
        await renderPage(currentPage);
    }
    catch (err) {
        toast('Failed to load: ' + err.message, 'err');
        showWelcome();
    }
}
// ── Thumbnails ──────────────────────────────────────────
async function generateThumbnails() {
    if (!pdf)
        return;
    const targetPdf = pdf;
    const targetPages = totalPages;
    dom.thumbList.querySelectorAll('canvas').forEach(c => {
        c.width = 0;
        c.height = 0;
    });
    dom.thumbList.innerHTML = '';
    for (let p = 1; p <= targetPages; p++) {
        const item = document.createElement('div');
        item.className = `thumb-item${p === 1 ? ' active' : ''}`;
        item.dataset['page'] = String(p);
        item.innerHTML = `<span class="thumb-num">${p}</span>`;
        item.addEventListener('click', () => goToPage(p));
        dom.thumbList.appendChild(item);
        // Render in background
        (async () => {
            try {
                if (pdf !== targetPdf)
                    return;
                const page = await targetPdf.getPage(p);
                const vp = page.getViewport({ scale: 0.18 });
                const c = document.createElement('canvas');
                c.width = vp.width;
                c.height = vp.height;
                await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                if (pdf !== targetPdf)
                    return;
                item.insertBefore(c, item.querySelector('.thumb-num'));
            }
            catch (err) {
                if (err?.name !== 'RenderingCancelledException') {
                    console.warn('Thumbnail render error on page', p, err);
                }
            }
        })();
        if (p % 5 === 0)
            await new Promise(r => setTimeout(r, 0));
    }
}
function updateActiveThumbnail(p) {
    dom.thumbList.querySelectorAll('.thumb-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset['page'] ?? '0') === p);
    });
    dom.thumbList.querySelector('.thumb-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// ── PDF Rendering ───────────────────────────────────────
async function renderPage(pageNum) {
    if (!pdf)
        return;
    pageNum = Math.max(1, Math.min(pageNum, totalPages));
    currentPage = pageNum;
    showLoader('Rendering page…');
    if (renderTask) {
        try {
            renderTask.cancel();
        }
        catch (err) {
            console.warn('Render cancel error:', err);
        }
    }
    try {
        const page = await pdf.getPage(pageNum);
        // On mobile, auto-fit scale to viewer width before rendering
        if (window.innerWidth < 640) {
            const nv = page.getViewport({ scale: 1 });
            const tw = dom.viewerWrap.clientWidth - 24;
            if (nv.width > 0)
                scale = tw / nv.width;
        }
        const viewport = page.getViewport({ scale });
        const ctx = dom.pdfCanvas.getContext('2d');
        dom.pdfCanvas.width = viewport.width;
        dom.pdfCanvas.height = viewport.height;
        dom.textLayer.style.width = viewport.width + 'px';
        dom.textLayer.style.height = viewport.height + 'px';
        const task = page.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
        const textContent = await page.getTextContent();
        buildTextLayer(textContent, viewport);
        dom.pageInput.value = String(pageNum);
        dom.prevPage.disabled = pageNum <= 1;
        dom.nextPage.disabled = pageNum >= totalPages;
        updateActiveThumbnail(pageNum);
        updateProgress();
        showPage();
        dom.viewerWrap.scrollTop = 0;
        saveCurrentProgress();
    }
    catch (err) {
        if (err?.name === 'RenderingCancelledException')
            return;
        toast('Render error: ' + err.message, 'err');
        showWelcome();
    }
}
// ── Text Overlay Layer ──────────────────────────────────
function buildTextLayer(content, viewport) {
    dom.textLayer.innerHTML = '';
    items = [];
    pageFullText = '';
    currentItemIdx = -1;
    const mapped = [];
    content.items.forEach((item) => {
        if (!item.str)
            return; // keep spaces during mapping
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontH = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const left = tx[4];
        const top = tx[5] - fontH;
        const width = Math.abs(item.width * viewport.scale);
        if (top < -fontH || left < -width)
            return;
        mapped.push({
            str: item.str, left, top, width,
            height: fontH * 1.2, fontH,
            right: left + width,
            baseline: tx[5], // y-coordinate of baseline
        });
    });
    if (!mapped.length)
        return;
    // ── Step 2: Sort top-to-bottom, then left-to-right ──
    mapped.sort((a, b) => {
        const dy = a.baseline - b.baseline;
        if (Math.abs(dy) > a.fontH * 0.5)
            return dy;
        return a.left - b.left;
    });
    const groups = [];
    for (const m of mapped) {
        if (!groups.length) {
            groups.push({ ...m, text: m.str });
            continue;
        }
        const prev = groups[groups.length - 1];
        const sameLine = Math.abs(m.baseline - prev.baseline) < prev.fontH * 0.5;
        const charWidth = prev.fontH * 0.55; // approx char width
        const gap = m.left - prev.right;
        const adjacent = gap < charWidth * 1.5; // close enough to merge
        if (sameLine && adjacent) {
            // Merge: add a space only if there's a real gap (> ~0.35 char)
            // Increased from 0.2 to 0.35 to account for wide font kerning
            const needsSpace = gap > charWidth * 0.35;
            prev.text += (needsSpace ? ' ' : '') + m.str;
            prev.width = (m.left + m.width) - prev.left;
            prev.right = m.left + m.width;
        }
        else {
            groups.push({ ...m, text: m.str });
        }
    }
    // ── Step 4: Build overlay divs and TTS text from groups ──
    groups.forEach((g) => {
        if (!g.text.trim())
            return;
        const span = document.createElement('span');
        span.className = 'tl-item';
        span.textContent = g.text;
        span.style.cssText =
            `left:${g.left.toFixed(1)}px;top:${g.top.toFixed(1)}px;` +
                `width:${g.width.toFixed(1)}px;height:${g.height.toFixed(1)}px;` +
                `font-size:${g.fontH.toFixed(1)}px`;
        const processed = preprocessForTTS(g.text);
        const startChar = pageFullText.length;
        pageFullText += processed + ' ';
        const endChar = pageFullText.length;
        const idx = items.length;
        span.addEventListener('mousedown', (e) => {
            // Small delay to see if user is actually selecting
            const startX = e.clientX;
            const startY = e.clientY;
            const mouseUpHandler = (upE) => {
                document.removeEventListener('mouseup', mouseUpHandler);
                const dist = Math.sqrt(Math.pow(upE.clientX - startX, 2) + Math.pow(upE.clientY - startY, 2));
                // If they didn't move much and didn't select text, treat as click
                if (dist < 5 && (!window.getSelection() || window.getSelection().isCollapsed)) {
                    jumpToItem(idx);
                }
            };
            document.addEventListener('mouseup', mouseUpHandler);
        });
        items.push({ rawText: g.text, processedText: processed, startChar, endChar, el: span });
        dom.textLayer.appendChild(span);
    });
}
// ── TTS Engine ──────────────────────────────────────────
function startTTS() {
    if (!pdf || !pageFullText.trim())
        return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(pageFullText);
    utt.rate = rate;
    utt.pitch = pitch;
    if (voice)
        utt.voice = voice;
    // Map character boundary → text overlay item → amber highlight
    utt.onboundary = (e) => {
        if (e.name !== 'word')
            return;
        highlightAt(e.charIndex);
    };
    utt.onend = () => {
        if (!isSpeaking)
            return;
        clearHighlights();
        if (autoAdvance && currentPage < totalPages) {
            renderPage(currentPage + 1).then(() => { if (isSpeaking)
                startTTS(); });
        }
        else {
            isSpeaking = false;
            isPaused = false;
            setPlayState(false);
            if (currentPage >= totalPages)
                toast('🎉 Finished!', 'ok');
        }
    };
    utt.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled')
            return;
        console.error('TTS error:', e.error);
    };
    isSpeaking = true;
    isPaused = false;
    speechSynthesis.speak(utt);
    setPlayState(true);
}
function pauseTTS() { speechSynthesis.pause(); isPaused = true; setPlayState(false); }
function resumeTTS() { speechSynthesis.resume(); isPaused = false; setPlayState(true); }
function stopTTS() {
    speechSynthesis.cancel();
    isSpeaking = false;
    isPaused = false;
    setPlayState(false);
    clearHighlights();
}
function restartTTS() { stopTTS(); setTimeout(startTTS, 60); }
// ── Highlight ───────────────────────────────────────────
function highlightAt(charIdx) {
    // Binary search the item whose [startChar, endChar) contains charIdx
    let lo = 0, hi = items.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const it = items[mid];
        if (charIdx >= it.startChar && charIdx < it.endChar) {
            found = mid;
            break;
        }
        else if (charIdx < it.startChar)
            hi = mid - 1;
        else
            lo = mid + 1;
    }
    if (found < 0 || found === currentItemIdx)
        return;
    if (currentItemIdx >= 0) {
        items[currentItemIdx].el.classList.remove('hl-active');
        items[currentItemIdx].el.classList.add('hl-read');
    }
    currentItemIdx = found;
    items[found].el.classList.add('hl-active');
    items[found].el.classList.remove('hl-read');
    items[found].el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearHighlights() {
    currentItemIdx = -1;
    items.forEach(it => it.el.classList.remove('hl-active', 'hl-read'));
}
function jumpToItem(idx) {
    stopTTS();
    // Rebuild pageFullText starting from this item
    let c = 0;
    items.forEach((it, i) => {
        if (i < idx) {
            it.el.classList.add('hl-read');
            return;
        }
        it.startChar = c;
        c += it.processedText.length + 1;
        it.endChar = c;
    });
    pageFullText = items.slice(idx).map(it => it.processedText).join(' ') + ' ';
    setTimeout(startTTS, 60);
}
// ── Player controls ─────────────────────────────────────
dom.playBtn.addEventListener('click', () => {
    if (!isSpeaking && !isPaused)
        startTTS();
    else if (isSpeaking && !isPaused)
        pauseTTS();
    else
        resumeTTS();
});
dom.stopBtn.addEventListener('click', () => {
    stopTTS();
    // Reset item positions for fresh read
    let c = 0;
    items.forEach(it => { it.startChar = c; c += it.processedText.length + 1; it.endChar = c; });
    pageFullText = items.map(it => it.processedText).join(' ') + ' ';
});
dom.skipBack.addEventListener('click', () => jumpToItem(Math.max(0, currentItemIdx - 6)));
dom.skipFwd.addEventListener('click', () => jumpToItem(Math.min(items.length - 1, Math.max(0, currentItemIdx + 6))));
function setPlayState(playing) {
    dom.playBtn.querySelector('.ico-play').style.display = playing ? 'none' : '';
    dom.playBtn.querySelector('.ico-pause').style.display = playing ? '' : 'none';
}
// ── Speed & Pitch ───────────────────────────────────────
function setRate(r) {
    rate = Math.max(0.25, Math.min(4, Math.round(r * 100) / 100));
    dom.spdVal.textContent = rate.toFixed(1) + '×';
    if (isSpeaking)
        restartTTS();
}
dom.spdDn.addEventListener('click', () => setRate(rate - 0.25));
dom.spdUp.addEventListener('click', () => setRate(rate + 0.25));
dom.pitchSlider.addEventListener('input', () => { pitch = parseFloat(dom.pitchSlider.value); if (isSpeaking)
    restartTTS(); });
// Auto-advance
dom.autoBtn.addEventListener('click', () => {
    autoAdvance = !autoAdvance;
    dom.autoBtn.dataset['on'] = String(autoAdvance);
    toast(`Auto-advance ${autoAdvance ? 'ON' : 'OFF'}`, 'info', 1400);
});
// ── Page navigation ─────────────────────────────────────
async function goToPage(p) {
    if (!pdf || p === currentPage)
        return;
    const was = isSpeaking && !isPaused;
    stopTTS();
    await renderPage(p);
    if (was)
        startTTS();
}
dom.prevPage.addEventListener('click', () => goToPage(currentPage - 1));
dom.nextPage.addEventListener('click', () => goToPage(currentPage + 1));
dom.pageInput.addEventListener('change', () => {
    const p = parseInt(dom.pageInput.value, 10);
    if (!isNaN(p))
        goToPage(Math.max(1, Math.min(p, totalPages)));
});
// ── Zoom ────────────────────────────────────────────────
function setScale(s) {
    scale = Math.max(0.5, Math.min(3.5, Math.round(s * 10) / 10));
    dom.zoomVal.textContent = Math.round((scale / 1.5) * 100) + '%';
    const was = isSpeaking && !isPaused;
    stopTTS();
    renderPage(currentPage).then(() => { if (was)
        startTTS(); });
}
dom.zoomIn.addEventListener('click', () => setScale(scale + 0.25));
dom.zoomOut.addEventListener('click', () => setScale(scale - 0.25));
dom.fitPage.addEventListener('click', () => {
    if (!pdf)
        return;
    pdf.getPage(currentPage).then(page => {
        const vp = page.getViewport({ scale: 1 });
        setScale((dom.viewerWrap.clientWidth - 80) / vp.width);
    });
});
// ── Progress ────────────────────────────────────────────
function updateProgress() {
    const pct = totalPages > 0 ? ((currentPage - 1) / totalPages) * 100 : 0;
    dom.progFill.style.width = pct + '%';
    dom.progLbl.textContent = `Page ${currentPage} of ${totalPages}`;
    dom.progPct.textContent = Math.round(pct) + '%';
}
// ── UI helpers ──────────────────────────────────────────
function showWelcome() { dom.welcome.style.display = ''; dom.loader.style.display = 'none'; dom.pageContainer.style.display = 'none'; }
function showLoader(msg) { dom.loaderMsg.textContent = msg; dom.welcome.style.display = 'none'; dom.loader.style.display = ''; dom.pageContainer.style.display = 'none'; }
function showPage() { dom.welcome.style.display = 'none'; dom.loader.style.display = 'none'; dom.pageContainer.style.display = ''; }
function enableControls(on) {
    dom.playBtn.disabled = !on;
    dom.stopBtn.disabled = !on;
    dom.skipBack.disabled = !on;
    dom.skipFwd.disabled = !on;
}
// ── Keyboard shortcuts ──────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))
        return;
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            dom.playBtn.click();
            break;
        case 'ArrowRight':
            if (e.shiftKey)
                goToPage(currentPage + 1);
            else
                dom.skipFwd.click();
            break;
        case 'ArrowLeft':
            if (e.shiftKey)
                goToPage(currentPage - 1);
            else
                dom.skipBack.click();
            break;
        case 'ArrowUp':
            e.preventDefault();
            setRate(rate + 0.25);
            break;
        case 'ArrowDown':
            e.preventDefault();
            setRate(rate - 0.25);
            break;
    }
});
// ── Water Ripple Effect ─────────────────────────────────
(function initWaterRipple() {
    const canvas = dom.waterCanvas;
    if (!canvas)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    let width, height;
    let rippleData, lastRippleData;
    let rippleWidth, rippleHeight;
    let size;
    let imageData;
    function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = width;
        canvas.height = height;
        // Use a smaller internal buffer for better performance
        rippleWidth = Math.floor(width / 4);
        rippleHeight = Math.floor(height / 4);
        size = rippleWidth * rippleHeight;
        rippleData = new Int16Array(size);
        lastRippleData = new Int16Array(size);
        imageData = ctx.createImageData(width, height);
    }
    window.addEventListener('resize', resize);
    resize();
    function dropAt(x, y) {
        const ix = Math.floor((x / width) * rippleWidth);
        const iy = Math.floor((y / height) * rippleHeight);
        const index = iy * rippleWidth + ix;
        if (index >= 0 && index < size) {
            rippleData[index] = 512;
        }
    }
    function update() {
        for (let i = rippleWidth; i < size - rippleWidth; i++) {
            rippleData[i] = ((lastRippleData[i - 1] +
                lastRippleData[i + 1] +
                lastRippleData[i - rippleWidth] +
                lastRippleData[i + rippleWidth]) >> 1) - rippleData[i];
            rippleData[i] -= rippleData[i] >> 5; // Damping
        }
        // Swap buffers
        const temp = lastRippleData;
        lastRippleData = rippleData;
        rippleData = temp;
    }
    function render() {
        const data = imageData.data;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const ix = Math.floor((x / width) * rippleWidth);
                const iy = Math.floor((y / height) * rippleHeight);
                const val = lastRippleData[iy * rippleWidth + ix];
                const offset = (y * width + x) * 4;
                data[offset] = 47; // R
                data[offset + 1] = 47; // G
                data[offset + 2] = 228; // B
                data[offset + 3] = Math.min(255, Math.max(0, 40 + (val >> 2))); // A
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }
    function loop() {
        update();
        render();
        requestAnimationFrame(loop);
    }
    loop();
    // Trigger drop every 9 seconds
    setInterval(() => {
        dropAt(Math.random() * width, height / 2);
    }, 9000);
})();
(function init4D() {
    const welcome = byId('welcome');
    const target = welcome.querySelector('.parallax-target');
    const grid = welcome.querySelector('.cyber-grid');
    const pctEl = byId('initPct');
    if (!target)
        return;
    // Technical Loader animation
    let pct = 0;
    const interval = setInterval(() => {
        pct += Math.floor(Math.random() * 8) + 1;
        if (pct >= 100) {
            pct = 100;
            clearInterval(interval);
            setTimeout(() => {
                const status = welcome.querySelector('.system-status');
                if (status)
                    status.innerHTML = 'READER_READY // SYSTEM_ONLINE';
            }, 500);
        }
        if (pctEl)
            pctEl.textContent = `${pct}%`;
    }, 80);
    welcome.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        const { innerWidth, innerHeight } = window;
        // Calculate tilt
        const xTilt = ((clientY / innerHeight) - 0.5) * -30;
        const yTilt = ((clientX / innerWidth) - 0.5) * 30;
        target.style.transform = `rotateX(${xTilt}deg) rotateY(${yTilt}deg)`;
        // Grid parallax
        if (grid) {
            grid.style.backgroundPosition = `${yTilt * 2}px ${xTilt * 2}px`;
        }
    });
    welcome.addEventListener('mouseleave', () => {
        target.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
})();
localDb.init().then(async () => {
    await refreshLibrary();
    // Auto-load most recent
    const books = await localDb.getAllBooks();
    if (books.length) {
        const progs = await Promise.all(books.map(b => localDb.getProgress(b.id)));
        const validProgs = progs.filter((p) => !!p);
        if (validProgs.length) {
            validProgs.sort((a, b) => b.lastRead - a.lastRead);
            loadFromLibrary(validProgs[0].bookId);
        }
    }
});
// ── Touch swipe gestures ─────────────────────────────────
(function initSwipe() {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 60; // px
    dom.viewerWrap.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    dom.viewerWrap.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        // Only count horizontal swipe (not a vertical scroll)
        if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx))
            return;
        if (dx < 0) {
            // Swipe left → next page
            goToPage(currentPage + 1);
        }
        else {
            // Swipe right → previous page
            goToPage(currentPage - 1);
        }
    }, { passive: true });
})();
// ═══════════════════════════════════════════════════
// PWA — Service Worker + Install Prompt
// ═══════════════════════════════════════════════════
// ── Register Service Worker ────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            // Check for updates
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker)
                    return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner(newWorker);
                    }
                });
            });
        }).catch(err => console.warn('SW registration failed:', err));
    });
}
// ── Install Prompt (Android/Chrome/Edge) ───────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Show install banner (only if not already installed / dismissed)
    if (!localStorage.getItem('lexa-install-dismissed')) {
        const banner = document.getElementById('installBanner');
        banner.style.display = '';
    }
});
document.getElementById('installBtn')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt)
        return;
    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted')
        toast('LexaRead installed! 🎉', 'ok', 3000);
    deferredInstallPrompt = null;
    document.getElementById('installBanner').style.display = 'none';
});
document.getElementById('installDismiss')?.addEventListener('click', () => {
    document.getElementById('installBanner').style.display = 'none';
    localStorage.setItem('lexa-install-dismissed', '1');
});
// ── Update Banner ──────────────────────────────────
function showUpdateBanner(worker) {
    const banner = document.getElementById('updateBanner');
    banner.style.display = '';
    document.getElementById('updateBtn')?.addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        banner.style.display = 'none';
        window.location.reload();
    });
    document.getElementById('updateDismiss')?.addEventListener('click', () => {
        banner.style.display = 'none';
    });
}
// ── App installed: hide banner ─────────────────────
window.addEventListener('appinstalled', () => {
    document.getElementById('installBanner').style.display = 'none';
    toast('LexaRead added to home screen! 🎉', 'ok', 3000);
});
