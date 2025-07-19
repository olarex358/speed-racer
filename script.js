class AudioManager {
    constructor() {
        this.sounds = {};
        this.isMuted = JSON.parse(localStorage.getItem('isMuted')) || false;
    }
    loadSounds() {
        this.sounds = {
            music: new Audio('sounds/music.mp3'),
            coin: new Audio('sounds/coin.mp3'),
            crash: new Audio('sounds/crash.mp3'),
            powerup: new Audio('sounds/powerup.mp3'),
            click: new Audio('sounds/click.mp3'), // Ensure this file exists
            countdown_tick: new Audio('sounds/countdown_tick.mp3'),
            race_go: new Audio('sounds/race_go.mp3') // Ensure this file exists
        };
        this.sounds.music.loop = true;
    }
    playSound(name) {
        if (this.isMuted || !this.sounds[name]) return;
        this.sounds[name].currentTime = 0;
        this.sounds[name].play().catch(e => console.warn(`Could not play sound: ${name} (likely not supported or failed to load)`, e));
    }
    stopSound(name) {
        if (this.sounds[name]) {
            this.sounds[name].pause();
            this.sounds[name].currentTime = 0;
        }
    }
    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('isMuted', this.isMuted);
        if (this.isMuted) {
            Object.values(this.sounds).forEach(sound => {
                sound.pause();
                sound.currentTime = 0;
            });
        }
        return this.isMuted;
    }
}

class AchievementManager {
    constructor() {
        this.achievements = {
            rookie: { name: 'Rookie Driver', desc: 'Play your first game.', metric: 'gamesPlayed', target: 1, unlocked: false },
            survivor: { name: 'Survivor', desc: 'Score over 5,000 points.', metric: 'highScore', target: 5000, unlocked: false },
            collector: { name: 'Collector', desc: 'Collect 500 total coins.', metric: 'totalCoinsEver', target: 500, unlocked: false },
            comboArtist: { name: 'Combo Artist', desc: 'Reach a 5x combo.', metric: 'maxCombo', target: 5, unlocked: false },
            blocker: { name: 'Blocker', desc: 'Block 10 obstacles with a shield.', metric: 'obstaclesBlocked', target: 10, unlocked: false },
            hoarder: { name: 'Hoarder', desc: 'Unlock all cars.', metric: 'carsUnlocked', target: 3, unlocked: false }
        };
        this.stats = {};
        this.onUnlock = null;
        this.load();
    }
    load() {
        this.stats = JSON.parse(localStorage.getItem('playerStats')) || {};
        const unlockedIds = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
        unlockedIds.forEach(id => {
            if (this.achievements[id]) this.achievements[id].unlocked = true;
        });
    }
    save() {
        localStorage.setItem('playerStats', JSON.stringify(this.stats));
        const unlockedIds = Object.keys(this.achievements).filter(id => this.achievements[id].unlocked);
        localStorage.setItem('unlockedAchievements', JSON.stringify(unlockedIds));
    }
    trackStat(metric, value) {
        if (['gamesPlayed', 'totalCoinsEver', 'obstaclesBlocked'].includes(metric)) {
            this.stats[metric] = (this.stats[metric] || 0) + value;
        } else if (['highScore', 'maxCombo'].includes(metric)) {
            if (value > (this.stats[metric] || 0)) this.stats[metric] = value;
        } else {
            this.stats[metric] = value;
        }
        this.checkUnlocks();
        this.save();
    }
    checkUnlocks() {
        for (const id in this.achievements) {
            const ach = this.achievements[id];
            if (!ach.unlocked && this.stats[ach.metric] >= ach.target) this.unlock(id);
        }
    }
    unlock(id) {
        if (!this.achievements[id] || this.achievements[id].unlocked) return;
        this.achievements[id].unlocked = true;
        if (this.onUnlock) this.onUnlock(this.achievements[id]);
    }
}

class Game {
    constructor() {
        this.audioManager = new AudioManager();
        this.achievementManager = new AchievementManager();

        // PWA installation prompt deferred event
        this.deferredInstallPrompt = null;

        this.getDOMElements();
        this.setupGameConfig();
        this.setupCarAssets();
        this.init();
    }

    getDOMElements() {
        this.gameContainer = document.getElementById('game-container');
        this.mainMenu = document.getElementById('main-menu');
        this.gamePlayScreen = document.getElementById('game-play-screen');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        this.pauseOverlay = document.getElementById('pause-overlay');
        this.mainMenuContent = document.getElementById('main-menu-content');
        this.garageScreen = document.getElementById('garage-screen');
        this.achievementsScreen = document.getElementById('achievements-screen');
        this.startButton = document.getElementById('start-game-button');
        this.restartButton = document.getElementById('restart-button');
        this.pauseButton = document.getElementById('pause-button');
        this.garageButton = document.getElementById('garage-button');
        this.backToMenuButton = document.getElementById('back-to-menu-button');
        this.achievementsButton = document.getElementById('achievements-button');
        this.backToMenuFromAchButton = document.getElementById('back-to-menu-from-ach-button');
        this.muteButton = document.getElementById('mute-button');
        this.track = document.getElementById('track');
        this.car = document.getElementById('car');
        this.carSprite = document.getElementById('car-sprite');
        this.carMagnetField = document.getElementById('car-magnet-field');
        this.touchLeft = document.getElementById('touch-left');
        this.touchRight = document.getElementById('touch-right');
        this.totalCoinsDisplay = document.getElementById('total-coins-display');
        this.highscoreDisplay = document.getElementById('highscore-display');
        this.coinDisplay = document.getElementById('coin-display');
        this.scoreDisplay = document.getElementById('score-display');
        this.comboDisplay = document.getElementById('combo-display');
        this.finalCoinsDisplay = document.getElementById('final-coins');
        this.finalScoreDisplay = document.getElementById('final-score');
        this.shieldTimer = document.getElementById('shield-timer');
        this.magnetTimer = document.getElementById('magnet-timer');
        this.nitroTimer = document.getElementById('nitro-timer');
        this.countdown = document.getElementById('countdown');
        this.achievementToast = document.getElementById('achievement-toast');
        this.carOptionsContainer = document.getElementById('car-options');
        this.upgradeOptionsContainer = document.getElementById('upgrade-options');
        this.achievementsList = document.getElementById('achievements-list');

        // Get the PWA install button
        this.installPwaButton = document.getElementById('install-pwa-button');
    }

    setupGameConfig() {
        this.gameSpeed = 0; this.initialGameSpeed = 180; this.speedIncreaseAmount = 15; this.speedIncreaseInterval = 5000;
        this.LANE_WIDTH = 100; this.HITBOX_PADDING = 5;
        this.themes = ['theme-default', 'theme-night', 'theme-desert']; this.currentThemeIndex = 0;
        this.score = 0; this.comboCount = 0; this.comboMultiplier = 1; this.comboTimeout = null;
        this.powerUpDefinitions = {
            shield: { name: 'Shield', level: 1, maxLevel: 5, costs: [150, 300, 500, 800], values: [5000, 6000, 7000, 8000, 9000], desc: (val) => `${val/1000}s Duration` },
            magnet: { name: 'Magnet', level: 1, maxLevel: 5, costs: [100, 200, 400, 600], values: [80, 95, 110, 125, 140], desc: (val) => `${val}px Range` },
            nitro: { name: 'Nitro', level: 1, maxLevel: 5, costs: [200, 400, 600, 1000], values: [1.6, 1.7, 1.8, 1.9, 2.0], desc: (val) => `${Math.round((val-1)*100)}% Speed Boost` }
        };
    }

    setupCarAssets() {
        this.cars = [
            { id: 'default', name: 'Racer', cost: 0, src: 'images/race-car.png' },
            { id: 'blue', name: 'Comet', cost: 100, src: 'images/car_blue.png' },
            { id: 'green', name: 'Viper', cost: 250, src: 'images/car_green.png' }
        ];
    }

    init() {
        this.bindMethods();
        this.audioManager.loadSounds();
        this.achievementManager.onUnlock = this.showAchievementToast;
        this.addEventListeners();
        this.loadPlayerData();
        this.updateMuteButtonIcon();
        this.showMainMenu();
        this.setupPWAInstallPrompt(); // Call PWA setup here
    }

    bindMethods() {
        const methodsToBind = [
            'startGame', 'showMainMenu', 'togglePause', 'showGarage',
            'showAchievements', 'handleMuteToggle', 'handleKeyPress',
            'handleCarSelection', 'handleUpgrade', 'spawnItems', 'gameLoop',
            'increaseDifficulty', 'showAchievementToast',
            'handlePWAInstallClick', 'handlePWAInstalled'
        ];

        methodsToBind.forEach(method => {
            if (typeof this[method] === 'function') {
                this[method] = this[method].bind(this);
            }
        });
    }

    loadPlayerData() {
        this.totalCoins = parseInt(localStorage.getItem('totalCoins')) || 0;
        this.highscore = parseInt(localStorage.getItem('highscore')) || 0;
        this.unlockedCarIds = JSON.parse(localStorage.getItem('unlockedCars')) || ['default'];
        this.selectedCarId = localStorage.getItem('selectedCar') || 'default';
        const savedLevels = JSON.parse(localStorage.getItem('powerUpLevels')) || {};
        for (const key in this.powerUpDefinitions) {
            this.powerUpDefinitions[key].level = savedLevels[key] || 1;
        }
    }

    savePlayerData() {
        localStorage.setItem('totalCoins', this.totalCoins);
        localStorage.setItem('highscore', this.highscore);
        localStorage.setItem('unlockedCars', JSON.stringify(this.unlockedCarIds));
        localStorage.setItem('selectedCar', this.selectedCarId);
        const levelsToSave = {};
        for (const key in this.powerUpDefinitions) {
            levelsToSave[key] = this.powerUpDefinitions[key].level;
        }
        localStorage.setItem('powerUpLevels', JSON.stringify(levelsToSave));
    }

    addEventListeners() {
        this.startButton.addEventListener('click', this.startGame);
        this.restartButton.addEventListener('click', this.showMainMenu);
        this.pauseButton.addEventListener('click', this.togglePause);
        this.garageButton.addEventListener('click', this.showGarage);
        this.backToMenuButton.addEventListener('click', this.showMainMenu);
        this.achievementsButton.addEventListener('click', this.showAchievements);
        this.backToMenuFromAchButton.addEventListener('click', this.showMainMenu);
        this.muteButton.addEventListener('click', this.handleMuteToggle);
        document.addEventListener('keydown', this.handleKeyPress);
        this.touchLeft.addEventListener('touchstart', () => this.moveCar('left'));
        this.touchRight.addEventListener('touchstart', () => this.moveCar('right'));

        // PWA Install Button Listener
        this.installPwaButton.addEventListener('click', this.handlePWAInstallClick);
    }

    // --- PWA Installation Logic ---
    setupPWAInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault(); // Prevent default browser prompt
            this.deferredInstallPrompt = event;
            this.installPwaButton.style.display = 'block'; // Show the custom install button
            console.log('beforeinstallprompt fired, showing install button.');
        });

        window.addEventListener('appinstalled', this.handlePWAInstalled);
    }

    async handlePWAInstallClick() {
        this.audioManager.playSound('click'); // Play click sound
        if (this.deferredInstallPrompt) {
            console.log('Attempting to prompt PWA installation...');
            this.deferredInstallPrompt.prompt(); // Show the installation prompt

            const { outcome } = await this.deferredInstallPrompt.userChoice;
            console.log(`User response to PWA install prompt: ${outcome}`);

            // Hide the install button whether installed or dismissed
            if (outcome === 'accepted' || outcome === 'dismissed') {
                this.installPwaButton.style.display = 'none';
                this.deferredInstallPrompt = null; // Clear the stored event
            }
        } else {
            console.warn('Install button clicked, but deferredInstallPrompt is null. PWA might already be installed or criteria not met.');
        }
    }

    handlePWAInstalled() {
        this.installPwaButton.style.display = 'none';
        this.deferredInstallPrompt = null;
        console.log('PWA was successfully installed via the custom prompt!');
    }
    // --- End PWA Installation Logic ---

    handleMuteToggle() {
        this.audioManager.toggleMute();
        this.updateMuteButtonIcon();
    }

    updateMuteButtonIcon() {
        this.muteButton.innerHTML = this.audioManager.isMuted ? '🔇' : '🔊';
    }

    showMainMenu() {
        this.audioManager.playSound('click');
        this.mainMenuContent.style.display = 'flex';
        this.garageScreen.style.display = 'none';
        this.achievementsScreen.style.display = 'none';
        this.mainMenu.style.display = 'flex';
        this.gamePlayScreen.style.display = 'none';
        this.gameOverOverlay.style.display = 'none';
        this.pauseOverlay.style.display = 'none';
        this.car.classList.remove('damaged', 'shield-active');
        this.audioManager.stopSound('music');
        this.totalCoinsDisplay.textContent = this.totalCoins;
        this.highscoreDisplay.textContent = this.highscore;
        this.achievementManager.trackStat('carsUnlocked', this.unlockedCarIds.length);
        this.track.className = 'theme-default';

        // Check PWA installability whenever returning to main menu
        if (this.deferredInstallPrompt) {
             this.installPwaButton.style.display = 'block';
        } else if ('BeforeInstallPromptEvent' in window && !navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches) {
            // This is a heuristic. If the event hasn't fired but it's theoretically possible,
            // we could consider showing a message or retrying. For now, rely on deferredPrompt.
            // navigator.standalone is for iOS "Add to Home Screen"
            // window.matchMedia is for other PWAs
             console.log("PWA might be installable, but beforeinstallprompt hasn't fired or was consumed.");
        } else {
            this.installPwaButton.style.display = 'none'; // Hide if not installable or already installed
        }
    }

    showGarage() {
        this.audioManager.playSound('click');
        this.mainMenuContent.style.display = 'none';
        this.achievementsScreen.style.display = 'none';
        this.garageScreen.style.display = 'flex';
        this.populateCarOptions();
        this.populateUpgrades();
    }

    showAchievements() {
        this.audioManager.playSound('click');
        this.mainMenuContent.style.display = 'none';
        this.garageScreen.style.display = 'none';
        this.achievementsScreen.style.display = 'flex';
        this.populateAchievements();
    }

    populateAchievements() {
        this.achievementsList.innerHTML = '';
        for (const id in this.achievementManager.achievements) {
            const ach = this.achievementManager.achievements[id];
            const item = document.createElement('div');
            item.className = 'achievement-item';
            let icon = '❓'; let infoHTML = `<h4>???</h4><p>Keep playing to unlock!</p>`;
            if (ach.unlocked) {
                item.classList.add('unlocked'); icon = '🏆'; infoHTML = `<h4>${ach.name}</h4><p>${ach.desc}</p>`;
            } else {
                item.classList.add('locked');
            }
            item.innerHTML = `<div class="icon">${icon}</div><div class="achievement-item-info">${infoHTML}</div>`;
            this.achievementsList.appendChild(item);
        }
    }

    populateCarOptions() {
        this.carOptionsContainer.innerHTML = '';
        this.cars.forEach(car => {
            const isUnlocked = this.unlockedCarIds.includes(car.id);
            const isSelected = this.selectedCarId === car.id;
            const option = document.createElement('div');
            option.className = 'car-option';
            if (isSelected) option.classList.add('selected');
            if (!isUnlocked) option.classList.add('locked');
            option.innerHTML = `<img src="${car.src}" alt="${car.name}"><div>${car.name}</div><div>${isUnlocked ? 'Owned' : `Cost: ${car.cost}`}</div>`;
            option.addEventListener('click', () => this.handleCarSelection(car, isUnlocked));
            this.carOptionsContainer.appendChild(option);
        });
    }

    populateUpgrades() {
        this.upgradeOptionsContainer.innerHTML = '';
        for (const id in this.powerUpDefinitions) {
            const powerUp = this.powerUpDefinitions[id];
            const option = document.createElement('div');
            option.className = 'upgrade-option';
            const currentLevel = powerUp.level;
            const isMaxLevel = currentLevel >= powerUp.maxLevel;
            const cost = isMaxLevel ? 0 : powerUp.costs[currentLevel - 1];
            let buttonHTML = isMaxLevel ? `<button class="upgrade-button" disabled>Max</button>` : `<button class="upgrade-button" data-powerup-id="${id}" ${this.totalCoins < cost ? 'disabled' : ''}>${cost} Coins</button>`;
            option.innerHTML = `<div class="upgrade-option-info"><h4>${powerUp.name} - Lvl ${currentLevel}</h4><p>Current: ${powerUp.desc(powerUp.values[currentLevel - 1])}</p>${!isMaxLevel ? `<p>Next: ${powerUp.desc(powerUp.values[currentLevel])}</p>` : ''}</div>${buttonHTML}`;
            this.upgradeOptionsContainer.appendChild(option);
        }
        this.upgradeOptionsContainer.querySelectorAll('.upgrade-button').forEach(button => {
            if (!button.disabled) button.addEventListener('click', () => this.handleUpgrade(button.dataset.powerupId));
        });
    }

    handleCarSelection(car, isUnlocked) {
        this.audioManager.playSound('click');
        if (isUnlocked) {
            this.selectedCarId = car.id;
        } else if (this.totalCoins >= car.cost) {
            this.totalCoins -= car.cost;
            this.unlockedCarIds.push(car.id);
            this.selectedCarId = car.id;
            this.totalCoinsDisplay.textContent = this.totalCoins;
            this.achievementManager.trackStat('carsUnlocked', this.unlockedCarIds.length);
        } else { return; }
        this.savePlayerData();
        this.populateCarOptions();
    }

    handleUpgrade(id) {
        this.audioManager.playSound('click');
        const powerUp = this.powerUpDefinitions[id];
        const currentLevel = powerUp.level;
        if (currentLevel >= powerUp.maxLevel) return;
        const cost = powerUp.costs[currentLevel - 1];
        if (this.totalCoins >= cost) {
            this.totalCoins -= cost;
            powerUp.level++;
            this.savePlayerData();
            this.totalCoinsDisplay.textContent = this.totalCoins;
            this.populateUpgrades();
        }
    }

    startCountdown() {
        return new Promise(resolve => {
            this.countdown.style.display = 'flex'; let count = 3;
            const updateCount = () => {
                if (count > 0) {
                    this.countdown.innerHTML = `<span>${count}</span>`;
                    this.audioManager.playSound('countdown_tick');
                    count--; setTimeout(updateCount, 1000);
                } else {
                    this.countdown.innerHTML = `<span>GO!</span>`;
                    this.audioManager.playSound('race_go');
                    setTimeout(() => { this.countdown.style.display = 'none'; resolve(); }, 1000);
                }
            };
            updateCount();
        });
    }

    async startGame() {
        this.audioManager.playSound('click');
        this.gameRunning = true; this.isPaused = false;
        this.gameSpeed = this.initialGameSpeed;
        this.pauseButton.innerHTML = '❚❚';
        this.carPosition = 0;
        this.currentThemeIndex = 0; this.track.className = 'theme-default';
        this.coins = 0; this.items = [];
        this.controlsReversed = false; this.isMagnetActive = false; this.isShieldActive = false; this.isNitroActive = false;
        this.score = 0; this.comboCount = 0; this.comboMultiplier = 1;
        clearTimeout(this.comboTimeout);
        const selectedCar = this.cars.find(c => c.id === this.selectedCarId);
        this.carSprite.src = selectedCar.src;
        this.updateTrackSpeed();
        this.mainMenu.style.display = 'none';
        this.gamePlayScreen.style.display = 'block';
        this.updateUI();
        this.achievementManager.trackStat('gamesPlayed', 1);
        await this.startCountdown();
        if (!this.gameRunning) return;
        this.spawner = setInterval(this.spawnItems, 800);
        this.gameInterval = setInterval(this.gameLoop, 1000 / 60);
        this.difficultyInterval = setInterval(this.increaseDifficulty, this.speedIncreaseInterval);
        this.audioManager.playSound('music');
    }

    spawnItems() {
        const lane = Math.floor(Math.random() * 3) - 1;
        const roll = Math.random();
        if (roll < 0.45) {
            if (Math.random() < 0.3) this.createItem('moving-obstacle', lane); // Check images/obstacle_car.png path
            else this.createItem('obstacle', lane);
        } else if (roll < 0.70) this.createItem('coin', lane);
        else if (roll < 0.80) this.createItem('oil-slick', lane);
        else if (roll < 0.87) this.createItem('magnet-powerup', lane);
        else if (roll < 0.94) this.createItem('shield-powerup', lane);
        else this.createItem('nitro-powerup', lane);
    }

    createItem(type, lane) {
        const el = document.createElement('div');
        el.className = `game-item ${type}`; el.dataset.type = type;
        el.style.left = `calc(50% + ${lane * (this.LANE_WIDTH / 2)}px)`;
        el.style.top = `-50px`;
        this.gamePlayScreen.appendChild(el);
        this.items.push(el);

        const fallDistance = this.gameContainer.offsetHeight + 100;
        el.style.setProperty('--fall-distance', `${fallDistance}px`);

        const duration = fallDistance / this.gameSpeed;
        if (type === 'moving-obstacle') {
            el.style.animation = `pop-in 0.3s ease-out, move-down ${duration}s linear 0.3s forwards, move-in-lane 4s ease-in-out 0.3s infinite`;
        } else {
            el.style.animation = `pop-in 0.3s ease-out, move-down ${duration}s linear 0.3s forwards`;
        }
    }

    moveCar(direction) {
        if (!this.gameRunning || this.isPaused) return;
        const effectiveDirection = this.controlsReversed ? (direction === 'left' ? 'right' : 'left') : direction;
        this.carSprite.classList.remove('tilt-left', 'tilt-right');
        if (effectiveDirection === 'left') {
            if (this.carPosition > -1) this.carPosition--;
            this.carSprite.classList.add('tilt-left');
        } else if (effectiveDirection === 'right') {
            if (this.carPosition < 1) this.carPosition++;
            this.carSprite.classList.add('tilt-right');
        }
        setTimeout(() => { if (!this.isPaused) this.carSprite.classList.remove('tilt-left', 'tilt-right'); }, 200);
        this.car.style.left = `calc(50% + ${this.carPosition * (this.LANE_WIDTH / 2)}px)`;
    }

    handleItemCollection(item, index) {
        const type = item.dataset.type;
        if (type === 'obstacle' || type === 'moving-obstacle') {
            clearTimeout(this.comboTimeout);
            this.comboCount = 0;
            if (this.isShieldActive) {
                this.audioManager.playSound('crash');
                item.remove();
                this.items.splice(index, 1);
                this.achievementManager.trackStat('obstaclesBlocked', 1);
            } else {
                this.audioManager.playSound('crash');
                this.gameOver();
            }
            return;
        }
        if (type === 'coin') {
            this.coins++;
            this.comboCount++;
            this.updateMultiplier();
            this.score += 10 * this.comboMultiplier;
            this.resetComboTimeout();
            this.audioManager.playSound('coin');
            this.achievementManager.trackStat('maxCombo', this.comboMultiplier);
        }
        item.remove();
        this.items.splice(index, 1);
        if (type === 'oil-slick') { clearTimeout(this.comboTimeout); this.comboCount = 0; this.activateReversedControls(); }
        if (type === 'magnet-powerup') this.activateCoinMagnet();
        if (type === 'shield-powerup') this.activateShield();
        if (type === 'nitro-powerup') this.activateNitro();
        this.updateUI();
    }

    updateUI() {
        this.scoreDisplay.textContent = `Score: ${this.score}`;
        this.coinDisplay.textContent = `Coins: ${this.coins}`;
        if (this.comboMultiplier > 1) {
            this.comboDisplay.textContent = `${this.comboMultiplier}x COMBO`;
            this.comboDisplay.classList.add('active');
        } else {
            this.comboDisplay.textContent = '';
            this.comboDisplay.classList.remove('active');
        }
    }

    updateMultiplier() {
        if (this.comboCount >= 20) this.comboMultiplier = 5;
        else if (this.comboCount >= 10) this.comboMultiplier = 3;
        else if (this.comboCount >= 5) this.comboMultiplier = 2;
        else this.comboMultiplier = 1;
    }

    resetComboTimeout() {
        clearTimeout(this.comboTimeout);
        this.comboTimeout = setTimeout(() => {
            this.comboCount = 0; this.updateMultiplier(); this.updateUI();
        }, 2000);
    }

    showAchievementToast(achievement) {
        this.achievementToast.innerHTML = `<h3>🏆 Achievement Unlocked!</h3><p>${achievement.name}</p>`;
        this.achievementToast.classList.add('active');
        setTimeout(() => { this.achievementToast.classList.remove('active'); }, 4000);
    }

    startTimer(timerElement, duration) {
        timerElement.style.display = 'block';
        const bar = timerElement.querySelector('.timer-bar');
        bar.style.animation = 'none';
        void bar.offsetHeight; // Trigger reflow to restart animation
        bar.style.animation = `timer-bar-drain ${duration / 1000}s linear forwards`;
        setTimeout(() => { timerElement.style.display = 'none'; }, duration);
    }

    activateReversedControls() {
        this.audioManager.playSound('powerup');
        this.controlsReversed = true; this.car.classList.add('wobbling'); this.gameContainer.style.filter = 'invert(1)';
        setTimeout(() => { this.controlsReversed = false; this.car.classList.remove('wobbling'); this.gameContainer.style.filter = 'none'; }, 3000);
    }

    activateCoinMagnet() {
        this.audioManager.playSound('powerup');
        this.isMagnetActive = true; this.carMagnetField.classList.add('magnet-active');
        this.startTimer(this.magnetTimer, 5000);
        setTimeout(() => { this.isMagnetActive = false; this.carMagnetField.classList.remove('magnet-active'); }, 5000);
    }

    activateShield() {
        this.audioManager.playSound('powerup');
        this.isShieldActive = true; this.car.classList.add('shield-active');
        const level = this.powerUpDefinitions.shield.level;
        const duration = this.powerUpDefinitions.shield.values[level - 1];
        this.startTimer(this.shieldTimer, duration);
        setTimeout(() => { this.isShieldActive = false; this.car.classList.remove('shield-active'); }, duration);
    }

    activateNitro() {
        if (this.isNitroActive) return;
        this.audioManager.playSound('powerup');
        this.isNitroActive = true;
        this.car.classList.add('nitro-active'); this.track.classList.add('track-blurred');
        const duration = 3000;
        this.startTimer(this.nitroTimer, duration);
        const originalSpeed = this.gameSpeed;
        const level = this.powerUpDefinitions.nitro.level;
        const boostMultiplier = this.powerUpDefinitions.nitro.values[level - 1];
        this.gameSpeed *= boostMultiplier;
        this.updateTrackSpeed();
        setTimeout(() => {
            this.gameSpeed = originalSpeed; this.updateTrackSpeed();
            this.isNitroActive = false; this.car.classList.remove('nitro-active'); this.track.classList.remove('track-blurred');
        }, duration);
    }

    increaseDifficulty() {
        if (!this.gameRunning || this.isPaused) return;
        this.gameSpeed += this.speedIncreaseAmount; this.initialGameSpeed += this.speedIncreaseAmount;
        this.updateTrackSpeed(); this.changeTheme();
    }

    changeTheme() {
        this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
        this.track.className = this.themes[this.currentThemeIndex];
    }

    updateTrackSpeed() {
        const duration = 0.5 / (this.gameSpeed / 180);
        this.track.style.animationDuration = `${duration}s`;
    }

    togglePause() {
        if (!this.gameRunning) return;
        this.audioManager.playSound('click');
        this.isPaused = !this.isPaused;
        const playState = this.isPaused ? 'paused' : 'running';
        this.track.style.animationPlayState = playState;
        this.car.style.animationPlayState = playState;
        this.carSprite.style.animationPlayState = playState;
        this.items.forEach(item => item.style.animationPlayState = playState);
        if (this.isPaused) {
            clearInterval(this.gameInterval); clearInterval(this.spawner); clearInterval(this.difficultyInterval);
            this.audioManager.stopSound('music');
            this.pauseOverlay.style.display = 'flex'; this.pauseButton.innerHTML = '▶';
        } else {
            this.gameInterval = setInterval(this.gameLoop, 1000 / 60);
            this.spawner = setInterval(this.spawnItems, 800);
            this.difficultyInterval = setInterval(this.increaseDifficulty, this.speedIncreaseInterval);
            this.audioManager.playSound('music');
            this.pauseOverlay.style.display = 'none'; this.pauseButton.innerHTML = '❚❚';
        }
    }

    gameOver() {
        this.gameRunning = false; this.audioManager.stopSound('music');
        clearInterval(this.gameInterval); clearInterval(this.spawner); clearInterval(this.difficultyInterval);
        clearTimeout(this.comboTimeout);
        this.car.classList.add('damaged'); this.gameContainer.classList.add('screen-shaking');
        setTimeout(() => this.gameContainer.classList.remove('screen-shaking'), 500);
        this.items.forEach(item => item.style.animationPlayState = 'paused');
        this.totalCoins += this.coins;
        this.highscore = Math.max(this.highscore, this.score);
        this.achievementManager.trackStat('totalCoinsEver', this.coins);
        this.achievementManager.trackStat('highScore', this.score);
        this.savePlayerData();
        this.finalCoinsDisplay.textContent = this.coins;
        this.finalScoreDisplay.textContent = this.score;
        this.gameOverOverlay.style.display = 'flex';
        setTimeout(() => { this.items.forEach(item => item.remove()); this.items = []; }, 500);
    }

    gameLoop() {
        if (!this.gameRunning) return;
        const carRect = this.car.getBoundingClientRect();
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (!item) continue;
            const itemRect = item.getBoundingClientRect();
            if (itemRect.top > this.gameContainer.offsetHeight) {
                item.remove(); this.items.splice(i, 1); continue;
            }
            const padding = this.HITBOX_PADDING;
            const carHitbox = { top: carRect.top + padding, bottom: carRect.bottom - padding, left: carRect.left + padding, right: carRect.right - padding };
            const itemHitbox = { top: itemRect.top + padding, bottom: itemRect.bottom - padding, left: itemRect.left + padding, right: itemRect.right - padding };
            if (carHitbox.top < itemHitbox.bottom && carHitbox.bottom > itemHitbox.top && carHitbox.left < itemHitbox.right && carHitbox.right > itemHitbox.left) {
                this.handleItemCollection(item, i); continue;
            }
            if (this.isMagnetActive && item.dataset.type === 'coin') {
                const level = this.powerUpDefinitions.magnet.level;
                const magnetRange = this.powerUpDefinitions.magnet.values[level - 1];
                const dx = (carRect.left + carRect.width / 2) - (itemRect.left + itemRect.width / 2);
                const dy = (carRect.top + carRect.height / 2) - (itemRect.top + itemRect.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < magnetRange) {
                    this.handleItemCollection(item, i); continue;
                }
            }
        }
    }

    handleKeyPress(e) {
        if (e.key === 'p' || e.key === 'P') this.togglePause();
        if (this.isPaused) return;
        if (e.key === 'ArrowLeft') this.moveCar('left');
        else if (e.key === 'ArrowRight') this.moveCar('right');
    }
}

// Start the game once the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});