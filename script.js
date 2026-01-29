// Music Player Script
let audio;
let disc;
let playBtn;
let pauseBtn;
let progressBar;
let currentTimeSpan;
let durationSpan;
let currentSongName;

let isPlaying = false;
let rotationAngle = 0;
let animationId;

// Resolve asset URLs relative to where `script.js` is served from.
// This keeps paths working from both `/index.html` and `/Pages/*.html` (GitHub Pages friendly).
function getScriptBaseUrl() {
    const current = document.currentScript;
    if (current && current.src) return new URL('.', current.src);

    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || '';
        if (src.endsWith('/script.js') || src.endsWith('script.js')) {
            return new URL('.', src);
        }
    }

    // Fallback: relative to current page
    return new URL('./', window.location.href);
}

function assetUrl(pathFromScriptRoot) {
    return new URL(pathFromScriptRoot, getScriptBaseUrl()).toString();
}

// Floating hearts + flowers background (runs on every page that includes script.js)
function initFloatingBackground() {
    // Skip on flower page - it has its own animated garden
    if (document.body.classList.contains('flower-page')) return;
    
    // Respect users who prefer reduced motion
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Don't double-initialize
    if (document.querySelector('.floating-bg')) return;

    const container = document.createElement('div');
    container.className = 'floating-bg';

    // Put it at the very top of <body> so it's behind everything else
    if (document.body.firstChild) {
        document.body.insertBefore(container, document.body.firstChild);
    } else {
        document.body.appendChild(container);
    }

    const symbols = [
        { cls: 'heart', text: '❤' },
        { cls: 'flower', text: '🌸' },
        { cls: 'flower', text: '🌷' }
    ];

    function spawn() {
        if (!document.body.contains(container)) return;

        const pick = symbols[Math.floor(Math.random() * symbols.length)];
        const el = document.createElement('span');
        el.className = 'float-item ' + pick.cls;
        el.textContent = pick.text;

        const x = Math.random() * 100; // vw
        const size = 16 + Math.random() * 22; // px
        const dur = 7 + Math.random() * 6; // s
        const drift = (Math.random() * 140 - 70).toFixed(0) + 'px';
        const rot = (Math.random() * 720 - 360).toFixed(0) + 'deg';

        el.style.setProperty('--x', x + 'vw');
        el.style.setProperty('--size', size.toFixed(0) + 'px');
        el.style.setProperty('--dur', dur.toFixed(2) + 's');
        el.style.setProperty('--drift', drift);
        el.style.setProperty('--rot', rot);

        container.appendChild(el);

        el.addEventListener('animationend', function() {
            el.remove();
        });

        // Safety cleanup in case animationend doesn't fire
        setTimeout(function() {
            el.remove();
        }, (dur + 1) * 1000);

        // Keep DOM light
        const maxItems = 40;
        while (container.childElementCount > maxItems) {
            container.firstChild && container.firstChild.remove();
        }
    }

    // Start with a small burst, then steady spawns
    for (let i = 0; i < 12; i++) {
        setTimeout(spawn, i * 180);
    }
    setInterval(spawn, 380);
}

// -----------------------------------------------------------------------------
// Persistent background music (Global Player)
// -----------------------------------------------------------------------------
const BG_AUDIO_STORAGE_KEY = 'bg_music_player_v2';
let globalAudio = null;
let bgAudioSaveTimer = null;

// Default song
const DEFAULT_SONG = {
    path: 'audio/Taylor Swift - Paper Rings.mp3',
    name: 'Taylor Swift - Paper Rings'
};

// Song List for Random Selection
const SONG_LIST = [
    { path: 'audio/Apocalypse - Cigarettes After Sex - Cigarettes After Sex.mp3', name: 'Apocalypse - Cigarettes After Sex' },
    { path: 'audio/Arctic Monkeys - I Wanna Be Yours.mp3', name: 'Arctic Monkeys - I Wanna Be Yours' },
    { path: 'audio/Clif and Yden - Sunsets with You.mp3', name: 'Clif and Yden - Sunsets with You' },
    { path: 'audio/Paramore - The Only Exception.mp3', name: 'Paramore - The Only Exception' },
    { path: 'audio/Taylor Swift - Lover.mp3', name: 'Taylor Swift - Lover' },
    { path: 'audio/Taylor Swift - Paper Rings.mp3', name: 'Taylor Swift - Paper Rings' },
    { path: 'audio/The 1975 - About You.mp3', name: 'The 1975 - About You' },
    { path: 'audio/The 1975 - It\'s Not Living (If It\'s Not With You).mp3', name: 'The 1975 - It\'s Not Living (If It\'s Not With You)' }
];

function loadBgState() {
    try {
        const raw = localStorage.getItem(BG_AUDIO_STORAGE_KEY);
        // Default to Paper Rings if no state exists
        return raw ? JSON.parse(raw) : { 
            enabled: true, 
            playing: true, 
            time: 0, 
            currentSrc: assetUrl(DEFAULT_SONG.path), 
            currentName: DEFAULT_SONG.name 
        };
    } catch (e) {
        return { 
            enabled: true, 
            playing: true, 
            time: 0, 
            currentSrc: assetUrl(DEFAULT_SONG.path), 
            currentName: DEFAULT_SONG.name 
        };
    }
}

function saveBgState(patch) {
    const prev = loadBgState();
    const next = Object.assign({}, prev, patch);
    try {
        localStorage.setItem(BG_AUDIO_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
        // ignore storage failures
    }
}

function ensureEnableSoundButton() {
    if (document.getElementById('enableSoundBtn')) return;
    
    // Don't show on letter page (handled by CSS, but good to check)
    if (window.location.pathname.includes('letter.html')) return;

    const btn = document.createElement('button');
    btn.id = 'enableSoundBtn';
    btn.type = 'button';
    btn.textContent = 'Enable Music';
    btn.className = 'enable-sound-btn';
    btn.addEventListener('click', function() {
        if (globalAudio) {
            globalAudio.play().then(() => {
                hideEnableSoundButton();
                syncUI();
            });
        }
    });

    document.body.appendChild(btn);
}

function hideEnableSoundButton() {
    const btn = document.getElementById('enableSoundBtn');
    if (btn) btn.remove();
}

async function initGlobalAudio() {
    if (globalAudio) return;

    let state = loadBgState();
    
    // Check if we should randomize song (Gallery, Playlist, Future, Flower, Letter)
    const pageName = window.location.pathname.toLowerCase();
    const randomizePages = ['gallery.html', 'playlist.html', 'future.html', 'flower.html', 'letter.html'];
    const shouldRandomize = randomizePages.some(p => pageName.includes(p));

    if (shouldRandomize) {
        // Pick a random song
        const randomSong = SONG_LIST[Math.floor(Math.random() * SONG_LIST.length)];
        // Update state to use this new song from the beginning
        state.currentSrc = assetUrl(randomSong.path);
        state.currentName = randomSong.name;
        state.time = 0;
        state.playing = true;
        
        // Save immediately so subsequent reloads/navs track this song
        saveBgState(state);
    }

    const src = state.currentSrc || assetUrl(DEFAULT_SONG.path);
    
    globalAudio = new Audio(src);
    globalAudio.loop = true; // Loop the current song
    globalAudio.preload = 'auto';
    globalAudio.volume = 0.5;

    // Restore time
    // We bind it to 'loadedmetadata' to ensure it sticks.
    globalAudio.addEventListener('loadedmetadata', function() {
        if (state.time && state.time > 0) {
            globalAudio.currentTime = state.time;
        }
    });

    // Setup periodic state saving
    if (!bgAudioSaveTimer) {
        bgAudioSaveTimer = setInterval(function() {
            if (globalAudio) {
                // If playing, update time
                if (!globalAudio.paused) {
                     saveBgState({
                        playing: true,
                        time: globalAudio.currentTime,
                        currentSrc: globalAudio.src
                     });
                }
            }
        }, 1000);
    }
    
    // Save state before unloading the page to capture precise time
    window.addEventListener('beforeunload', function() {
        if (globalAudio) {
             saveBgState({
                playing: !globalAudio.paused,
                time: globalAudio.currentTime,
                currentSrc: globalAudio.src
             });
        }
    });

    // Attach events for UI sync
    globalAudio.addEventListener('play', syncUI);
    globalAudio.addEventListener('pause', syncUI);
    globalAudio.addEventListener('timeupdate', syncUI);
    globalAudio.addEventListener('ended', function() {
        // Loop is handled by loop=true, but if we want manual loop:
        if (!globalAudio.loop) {
             // For now do nothing
        }
        syncUI();
    });

    // Attempt autoplay if state says playing
    if (state.playing) {
        try {
            await globalAudio.play();
            hideEnableSoundButton();
        } catch (e) {
            console.log("Autoplay blocked, waiting for interaction");
            // Don't overwrite playing state immediately, just show button
            ensureEnableSoundButton();
        }
    } else {
        // If strictly paused, ensure button is hidden unless we want to prompt?
        // Actually, if it's paused, we just leave it paused.
    }
    
    syncUI();
}

// UI Synchronization (for Playlist Page)
function syncUI() {
    // Only run if we are on a page with player controls
    if (!document.getElementById('playBtn')) return;

    const isPlaying = globalAudio && !globalAudio.paused;
    
    // Buttons
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    if (playBtn && pauseBtn) {
        playBtn.style.display = isPlaying ? 'none' : 'inline-block';
        pauseBtn.style.display = isPlaying ? 'inline-block' : 'none';
    }

    // Disc Animation
    const disc = document.getElementById('musicDisc');
    if (disc) {
        if (isPlaying) {
            // We need a running animation loop for smooth rotation
            // But for simplicity, let's just use CSS class or check if we need to start the JS animation loop
            startDiscAnimation(); 
        } else {
            // Stop animation is handled in the loop
        }
    }

    // Progress Bar & Time
    const progressBar = document.getElementById('progressBar');
    const currentTimeSpan = document.getElementById('currentTime');
    const durationSpan = document.getElementById('duration');
    const songNameDisplay = document.getElementById('currentSongName');

    if (globalAudio) {
        if (progressBar) {
            if (!progressBar.getAttribute('mousedown')) { // Don't update while dragging
                progressBar.max = globalAudio.duration || 100;
                progressBar.value = globalAudio.currentTime;
            }
        }
        if (currentTimeSpan) currentTimeSpan.textContent = formatTime(globalAudio.currentTime);
        if (durationSpan) durationSpan.textContent = formatTime(globalAudio.duration);
        
        // Update Song Name
        const state = loadBgState();
        if (songNameDisplay && state.currentName) {
            // Only update if text is different to avoid flickering/reflow
            if (!songNameDisplay.textContent.includes(state.currentName)) {
                 songNameDisplay.textContent = 'Now Playing: ' + state.currentName;
            }
        }
    }
}

// Disc Animation Logic
let discAnimFrame;
let discRotation = 0;
function startDiscAnimation() {
    if (discAnimFrame) return; // Already running

    function animate() {
        const disc = document.getElementById('musicDisc');
        if (!disc) {
            cancelAnimationFrame(discAnimFrame);
            discAnimFrame = null;
            return;
        }

        if (globalAudio && !globalAudio.paused) {
            discRotation += 0.5;
            disc.style.transform = `rotate(${discRotation}deg)`;
            discAnimFrame = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(discAnimFrame);
            discAnimFrame = null;
        }
    }
    animate();
}

// Public Controls (called by UI)
function playAudio() {
    if (globalAudio) {
        globalAudio.play().catch(() => ensureEnableSoundButton());
    }
}

function pauseAudio() {
    if (globalAudio) globalAudio.pause();
}

function stopAudio() {
    if (globalAudio) {
        globalAudio.pause();
        globalAudio.currentTime = 0;
        syncUI();
    }
}

function changeSong(path, name) {
    if (!globalAudio) globalAudio = new Audio();
    
    // Resolve path correctly
    // If path starts with ../, and we are in root, we need to fix it?
    // actually changeSong is usually called from HTML. 
    // The `assetUrl` helper is robust, but `path` passed from HTML might be relative to that HTML.
    // Let's rely on the browser resolving the src, OR normalize it.
    // The safest is to just set src.
    
    globalAudio.src = path;
    globalAudio.currentTime = 0;
    globalAudio.play().catch(() => ensureEnableSoundButton());
    
    saveBgState({ 
        currentSrc: globalAudio.src, // Save absolute URL
        currentName: name,
        playing: true,
        time: 0
    });
    
    syncUI();
}

// Called from the landing page "Continue" button.
function continueFromLanding(nextPage) {
    if (globalAudio) {
        globalAudio.play().catch(() => {}).finally(() => {
             saveBgState({ playing: true });
             window.location.href = nextPage;
        });
    } else {
        window.location.href = nextPage;
    }
}

// Initialize on page load
window.addEventListener('load', function() {
    // If this page has the fixed header, offset the page content
    if (document.querySelector('.header')) {
        document.body.classList.add('has-header');
    }
    
    initFloatingBackground();
    
    // Initialize Global Audio
    initGlobalAudio();

    // DOM Elements for Playlist Page
    initDOMElements();
});

// Helper for playlist page inputs
function initDOMElements() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.addEventListener('input', function() {
            // User is dragging
            progressBar.setAttribute('mousedown', 'true');
        });
        progressBar.addEventListener('change', function() {
            // User released
            if (globalAudio) {
                globalAudio.currentTime = this.value;
            }
            this.removeAttribute('mousedown');
        });
    }
}

// Format time in MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

// -----------------------------------------------------------------------------
// End Global Player
// -----------------------------------------------------------------------------
