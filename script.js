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

// Floating hearts + flowers background (runs on every page that includes script.js)
function initFloatingBackground() {
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
// Persistent background "paper rustle" audio
//
// Important constraints:
// - Must start ONLY after user interaction (autoplay policies).
// - Must "continue" across page navigation.
//
// Since this project uses multi-page navigation (full reload on each page),
// we persist playback state (enabled + approximate position) in localStorage.
// On each page we restore and attempt to resume. If autoplay is blocked, we
// show a small "Enable sound" button so the user can re-authorize playback.
// -----------------------------------------------------------------------------
const BG_AUDIO_STORAGE_KEY = 'bg_rustle_v1';
let bgAudio = null;
let bgAudioSaveTimer = null;
let bgAudioFallback = null; // WebAudio fallback if file isn't available

function loadBgState() {
    try {
        const raw = localStorage.getItem(BG_AUDIO_STORAGE_KEY);
        return raw ? JSON.parse(raw) : { enabled: false, playing: false, time: 0 };
    } catch (e) {
        return { enabled: false, playing: false, time: 0 };
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

    const btn = document.createElement('button');
    btn.id = 'enableSoundBtn';
    btn.type = 'button';
    btn.textContent = 'Enable sound';
    btn.className = 'enable-sound-btn';
    btn.addEventListener('click', function() {
        startBackgroundRustle(true);
    });

    document.body.appendChild(btn);
}

function hideEnableSoundButton() {
    const btn = document.getElementById('enableSoundBtn');
    if (btn) btn.remove();
}

async function fileExists(url) {
    try {
        const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        return res.ok;
    } catch (e) {
        return false;
    }
}

// WebAudio fallback: a gentle, looping "paper rustle" style noise texture.
function startRustleFallback() {
    if (bgAudioFallback && bgAudioFallback.isRunning) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;

    // Create looping noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // Slow amplitude movement to feel like rustling
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.35;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start();
    lfo.start();

    // Fade in
    gain.gain.setValueAtTime(0.0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.5);

    bgAudioFallback = {
        ctx,
        gain,
        isRunning: true,
        stop: function() {
            try {
                gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.25);
                setTimeout(function() {
                    try { ctx.close(); } catch (e) {}
                }, 350);
            } catch (e) {}
            bgAudioFallback.isRunning = false;
        }
    };
}

function stopRustleFallback() {
    if (bgAudioFallback && bgAudioFallback.isRunning) {
        bgAudioFallback.stop();
    }
}

async function initBackgroundRustle() {
    if (bgAudio) return;

    // Prefer a real audio file if you add it to /audio
    // Put it here: audio/paper-rustle.mp3
    const fileUrl = '../audio/paper-rustle.mp3';
    const hasFile = await fileExists(fileUrl);

    if (!hasFile) {
        bgAudio = { _fallback: true };
        return;
    }

    bgAudio = new Audio(fileUrl);
    bgAudio.loop = true;
    bgAudio.preload = 'auto';
    bgAudio.volume = 0.22;
}

async function startBackgroundRustle(fromUserGesture) {
    await initBackgroundRustle();

    const state = loadBgState();
    saveBgState({ enabled: true, playing: true });

    // If we don't have a file, use the fallback (requires user gesture on many browsers)
    if (bgAudio && bgAudio._fallback) {
        if (fromUserGesture) {
            startRustleFallback();
            hideEnableSoundButton();
        } else {
            // Need interaction
            ensureEnableSoundButton();
        }
        return;
    }

    // Restore position if we have it (best-effort across reloads)
    if (bgAudio && typeof state.time === 'number' && state.time > 0) {
        try { bgAudio.currentTime = state.time; } catch (e) {}
    }

    if (!bgAudio) return;

    try {
        await bgAudio.play();
        hideEnableSoundButton();
        // Persist time periodically so navigation can resume
        if (!bgAudioSaveTimer) {
            bgAudioSaveTimer = setInterval(function() {
                try {
                    saveBgState({
                        playing: !bgAudio.paused,
                        time: bgAudio.currentTime || 0
                    });
                } catch (e) {}
            }, 500);
        }
    } catch (e) {
        // Autoplay blocked: show a button that the user can tap
        ensureEnableSoundButton();
    }
}

async function restoreBackgroundRustle() {
    const state = loadBgState();
    if (!state.enabled) return;

    // Try to resume automatically; if blocked, user can tap "Enable sound"
    await startBackgroundRustle(false);
}

// Called from the landing page "Continue" button.
function continueFromLanding(nextPage) {
    startBackgroundRustle(true).finally(function() {
        window.location.href = nextPage;
    });
}

// Initialize DOM elements
function initDOMElements() {
    audio = document.getElementById('audioPlayer');
    disc = document.getElementById('musicDisc');
    playBtn = document.getElementById('playBtn');
    pauseBtn = document.getElementById('pauseBtn');
    progressBar = document.getElementById('progressBar');
    currentTimeSpan = document.getElementById('currentTime');
    durationSpan = document.getElementById('duration');
    currentSongName = document.getElementById('currentSongName');
}

// Initialize on page load
window.addEventListener('load', function() {
    // If this page has the fixed header, offset the page content (not the header itself)
    if (document.querySelector('.header')) {
        document.body.classList.add('has-header');
    }
    initFloatingBackground();
    restoreBackgroundRustle();
    initDOMElements();
});

// Change song
function changeSong(songPath, songName) {
    console.log('Changing song to:', songPath);
    if (audio) {
        audio.src = songPath;
        if (currentSongName) currentSongName.textContent = 'Now Playing: ' + songName;
        playAudio();
    } else {
        console.log('Audio element not found');
    }
}

// Update duration when metadata is loaded
if (audio) {
    audio.addEventListener('loadedmetadata', function() {
        if (durationSpan) durationSpan.textContent = formatTime(audio.duration);
        if (progressBar) progressBar.max = audio.duration;
    });
}

// Format time in MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

// Play audio
function playAudio() {
    if (audio) {
        let playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(function() {
                isPlaying = true;
                if (playBtn) playBtn.style.display = 'none';
                if (pauseBtn) pauseBtn.style.display = 'inline-block';
                startDiscAnimation();
            }).catch(function(error) {
                console.log('Play failed:', error);
            });
        } else {
            isPlaying = true;
            if (playBtn) playBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'inline-block';
            startDiscAnimation();
        }
    }
}

// Pause audio
function pauseAudio() {
    if (audio) {
        audio.pause();
        isPlaying = false;
        if (playBtn) playBtn.style.display = 'inline-block';
        if (pauseBtn) pauseBtn.style.display = 'none';
        cancelAnimationFrame(animationId);
    }
}

// Stop audio
function stopAudio() {
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        isPlaying = false;
        if (playBtn) playBtn.style.display = 'inline-block';
        if (pauseBtn) pauseBtn.style.display = 'none';
        cancelAnimationFrame(animationId);
        if (disc) disc.style.transform = 'rotate(0deg)';
        if (progressBar) progressBar.value = 0;
        if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
        rotationAngle = 0;
    }
}

// Animate disc rotation
function startDiscAnimation() {
    function animate() {
        if (isPlaying && disc) {
            rotationAngle += 2; // Rotation speed
            disc.style.transform = 'rotate(' + rotationAngle + 'deg)';
            if (progressBar) progressBar.value = audio.currentTime;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(audio.currentTime);
            animationId = requestAnimationFrame(animate);
        }
    }
    animate();
}

// Update progress bar when user scrubs
if (progressBar) {
    progressBar.addEventListener('input', function() {
        if (audio) audio.currentTime = progressBar.value;
    });
}

// Update progress bar as audio plays
if (audio) {
    audio.addEventListener('timeupdate', function() {
        if (progressBar) progressBar.value = audio.currentTime;
        if (currentTimeSpan) currentTimeSpan.textContent = formatTime(audio.currentTime);
    });

    // Handle audio ended
    audio.addEventListener('ended', function() {
        stopAudio();
    });
}
