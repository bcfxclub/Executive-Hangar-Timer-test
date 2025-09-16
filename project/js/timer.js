// 计时器模块
class HangarTimer {
  constructor() {
    this.intervalId = null;
  }
  
  initialize(initialPhaseKey = '5-green') {
    this.stop();
    
    if (!STATE.timerEnabled) {
      this.showDisabledState();
      return;
    }
    
    const config = CONFIG.PHASE_CONFIG[initialPhaseKey];
    STATE.currentPhase = config.phase;
    STATE.currentLights = [...config.lights];
    
    const offsetMinutes = this.calculateOffset(config);
    const adjustedStartTime = new Date(STATE.startTime.getTime() - offsetMinutes * 60 * 1000);
    
    this.updateDisplay(adjustedStartTime);
    this.calculateHangarOpenTimes(adjustedStartTime);
    
    this.intervalId = setInterval(() => {
      this.updateDisplay(adjustedStartTime);
    }, 1000);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  calculateOffset(config) {
    let offsetMinutes = config.offset;
    
    if (config.phase === 'reset') {
      offsetMinutes = config.offset;
    } else if (config.phase === 'card') {
      offsetMinutes = CONFIG.PHASE_DURATIONS.reset + config.offset;
    } else if (config.phase === 'poweroff') {
      offsetMinutes = CONFIG.PHASE_DURATIONS.reset + CONFIG.PHASE_DURATIONS.card + config.offset;
    }
    
    return offsetMinutes;
  }
  
  updateDisplay(adjustedStartTime) {
    if (!STATE.timerEnabled) return;
    
    const now = new Date();
    const elapsedMs = now.getTime() - adjustedStartTime.getTime();
    const totalCycleMs = (CONFIG.PHASE_DURATIONS.reset + CONFIG.PHASE_DURATIONS.card + CONFIG.PHASE_DURATIONS.poweroff) * 60 * 1000;
    
    const cycleElapsedMs = elapsedMs % totalCycleMs;
    
    let phaseTimeRemaining;
    let phaseName;
    let phaseIcon;
    
    const currentCycleStart = new Date(now.getTime() - cycleElapsedMs);
    const currentHangarOpenTime = new Date(currentCycleStart.getTime() + CONFIG.PHASE_DURATIONS.reset * 60 * 1000);
    document.getElementById('hangar-open-time').innerHTML = `<i class="fas fa-play-circle"></i> 机库开启时间: ${this.formatDateTimeFull(currentHangarOpenTime)}`;
    
    if (cycleElapsedMs < CONFIG.PHASE_DURATIONS.reset * 60 * 1000) {
      STATE.currentPhase = 'reset';
      phaseName = '机库已关闭等待开启中';
      phaseIcon = 'fas fa-sync-alt';
      phaseTimeRemaining = CONFIG.PHASE_DURATIONS.reset * 60 * 1000 - cycleElapsedMs;
      
      const lightChangeInterval = 24 * 60 * 1000;
      const lightsChanged = Math.floor(cycleElapsedMs / lightChangeInterval);
      
      STATE.currentLights = Array(5).fill('red');
      for (let i = 0; i < Math.min(lightsChanged, 5); i++) {
        STATE.currentLights[i] = 'green';
      }
      
    } else if (cycleElapsedMs < (CONFIG.PHASE_DURATIONS.reset + CONFIG.PHASE_DURATIONS.card) * 60 * 1000) {
      STATE.currentPhase = 'card';
      phaseName = '机库开启中可插卡';
      phaseIcon = 'fas fa-credit-card';
      phaseTimeRemaining = (CONFIG.PHASE_DURATIONS.reset + CONFIG.PHASE_DURATIONS.card) * 60 * 1000 - cycleElapsedMs;
      
      const cardPhaseElapsed = cycleElapsedMs - CONFIG.PHASE_DURATIONS.reset * 60 * 1000;
      const lightChangeInterval = 12 * 60 * 1000;
      const lightsChanged = Math.floor(cardPhaseElapsed / lightChangeInterval);
      
      STATE.currentLights = Array(5).fill('green');
      for (let i = 0; i < Math.min(lightsChanged, 5); i++) {
        STATE.currentLights[i] = 'gray';
      }
      
    } else {
      STATE.currentPhase = 'poweroff';
      phaseName = '机库关闭倒计时中';
      phaseIcon = 'fas fa-power-off';
      phaseTimeRemaining = totalCycleMs - cycleElapsedMs;
      
      STATE.currentLights = Array(5).fill('gray');
    }
    
    const phaseIndicator = document.getElementById('phase-indicator');
    phaseIndicator.innerHTML = `<i class="${phaseIcon}"></i> <span>${phaseName}</span>`;
    phaseIndicator.className = 'phase-indicator';
    phaseIndicator.classList.add(`phase-${STATE.currentPhase}`);
    
    const countdownElement = document.getElementById('countdown');
    countdownElement.textContent = this.formatTimeRemaining(phaseTimeRemaining);
    
    this.updateLightsDisplay();
  }
  
  updateLightsDisplay() {
    for (let i = 0; i < 5; i++) {
      const lightElement = document.getElementById(`light-${i}`);
      lightElement.className = 'light';
      lightElement.classList.add(STATE.currentLights[i]);
      
      if (STATE.currentLights[i] !== 'gray') {
        lightElement.classList.add('active');
      }
    }
  }
  
  calculateHangarOpenTimes(adjustedStartTime) {
    const windowList = document.getElementById('window-list');
    windowList.innerHTML = '';
    
    const totalCycleMs = (CONFIG.PHASE_DURATIONS.reset + CONFIG.PHASE_DURATIONS.card + CONFIG.PHASE_DURATIONS.poweroff) * 60 * 1000;
    const firstGreenTime = new Date(adjustedStartTime.getTime() + CONFIG.PHASE_DURATIONS.reset * 60 * 1000);
    const now = new Date();
    
    let previousWindowTime = new Date(firstGreenTime.getTime());
    while (previousWindowTime.getTime() + totalCycleMs < now.getTime()) {
      previousWindowTime = new Date(previousWindowTime.getTime() + totalCycleMs);
    }
    
    if (now.getTime() > firstGreenTime.getTime()) {
      const prevItem = document.createElement('li');
      prevItem.innerHTML = `<i class="fas fa-window-restore"></i> 上次开启时间: ${this.formatDateTimeFull(previousWindowTime)}`;
      windowList.appendChild(prevItem);
    }
    
    for (let i = 0; i < 8; i++) {
      const windowTime = new Date(previousWindowTime.getTime() + (i + 1) * totalCycleMs);
      const listItem = document.createElement('li');
      
      if (i === 0) {
        listItem.innerHTML = `<i class="fas fa-window-restore"></i> 下次开启时间: ${this.formatDateTimeFull(windowTime)}`;
      } else {
        listItem.innerHTML = `<i class="fas fa-window-restore"></i> 开启时间 ${i+1}: ${this.formatDateTimeFull(windowTime)}`;
      }
      
      windowList.appendChild(listItem);
    }
  }
  
  showDisabledState() {
    document.getElementById('phase-indicator').innerHTML = '<i class="fas fa-pause"></i> <span>计时器已关闭</span>';
    document.getElementById('phase-indicator').className = 'phase-indicator phase-disabled';
    document.getElementById('countdown').textContent = '00:00:00';
    document.getElementById('hangar-open-time').innerHTML = '<i class="fas fa-pause"></i> 计时器已关闭';
    
    for (let i = 0; i < 5; i++) {
      const lightElement = document.getElementById(`light-${i}`);
      lightElement.className = 'light gray';
    }
  }
  
  formatTimeRemaining(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
  }
  
  formatDateTime(date) {
    const year = date.getFullYear();
    const month = this.padZero(date.getMonth() + 1);
    const day = this.padZero(date.getDate());
    const hours = this.padZero(date.getHours());
    const minutes = this.padZero(date.getMinutes());
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  formatDateTimeFull(date) {
    const year = date.getFullYear();
    const month = this.padZero(date.getMonth() + 1);
    const day = this.padZero(date.getDate());
    const hours = this.padZero(date.getHours());
    const minutes = this.padZero(date.getMinutes());
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  
  padZero(num) {
    return num.toString().padStart(2, '0');
  }
}

// 创建全局计时器实例
const timer = new HangarTimer();