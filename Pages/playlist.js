const audio = document.getElementById('audioPlayer');
const disc = document.getElementById('musicDisc');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeSpan = document.getElementById('currentTime');
const durationSpan = document.getElementById('duration');
let isPlaying = false;
let rotationAngle = 0;
let animationId;

// Update duration when metadata is loaded
audio.addEventListener('loadedmetadata', function() {
    durationSpan.textContent = formatTime(audio.duration);
    progressBar.max = audio.duration;
});

// Format time in MM:SS
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

// Play audio
function playAudio() {
    audio.play();
    isPlaying = true;
    playBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    startDiscAnimation();
}

// Pause audio
function pauseAudio() {
    audio.pause();
    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    cancelAnimationFrame(animationId);
}

// Stop audio
function stopAudio() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    cancelAnimationFrame(animationId);
    disc.style.transform = 'rotate(0deg)';
    progressBar.value = 0;
    currentTimeSpan.textContent = '0:00';
    rotationAngle = 0;
}

// Animate disc rotation
function startDiscAnimation() {
    function animate() {
        if (isPlaying) {
            rotationAngle += 2; // Rotation speed
            disc.style.transform = 'rotate(' + rotationAngle + 'deg)';
            progressBar.value = audio.currentTime;
            currentTimeSpan.textContent = formatTime(audio.currentTime);
            animationId = requestAnimationFrame(animate);
        }
    }
    animate();
}

// Update progress bar when user scrubs
progressBar.addEventListener('input', function() {
    audio.currentTime = progressBar.value;
});

// Update progress bar as audio plays
audio.addEventListener('timeupdate', function() {
    progressBar.value = audio.currentTime;
    currentTimeSpan.textContent = formatTime(audio.currentTime);
});

// Handle audio ended
audio.addEventListener('ended', function() {
    stopAudio();
});
