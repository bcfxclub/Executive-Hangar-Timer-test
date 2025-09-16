// 配置常量
const CONFIG = {
  API_BASE: localStorage.getItem('apiBase') || "/api",
  DEFAULT_PASSWORD: 'admin',
  RETRY_TIMEOUT: 5000,
  MAX_RETRIES: 3,
  PHASE_DURATIONS: {
    reset: 120,      // 2小时 = 120分钟
    card: 60,        // 1小时 = 60分钟
    poweroff: 5      // 5分钟
  },
  PHASE_CONFIG: {
    '5-red': { phase: 'reset', lights: ['red', 'red', 'red', 'red', 'red'], offset: 0 },
    '1-green-4-red': { phase: 'reset', lights: ['green', 'red', 'red', 'red', 'red'], offset: 24 },
    '2-green-3-red': { phase: 'reset', lights: ['green', 'green', 'red', 'red', 'red'], offset: 48 },
    '3-green-2-red': { phase: 'reset', lights: ['green', 'green', 'green', 'red', 'red'], offset: 72 },
    '4-green-1-red': { phase: 'reset', lights: ['green', 'green', 'green', 'green', 'red'], offset: 96 },
    '5-green': { phase: 'card', lights: ['green', 'green', 'green', 'green', 'green'], offset: 0 },
    '1-gray-4-green': { phase: 'card', lights: ['gray', 'green', 'green', 'green', 'green'], offset: 12 },
    '2-gray-3-green': { phase: 'card', lights: ['gray', 'gray', 'green', 'green', 'green'], offset: 24 },
    '3-gray-2-green': { phase: 'card', lights: ['gray', 'gray', 'gray', 'green', 'green'], offset: 36 },
    '4-gray-1-green': { phase: 'card', lights: ['gray', 'gray', 'gray', 'gray', 'green'], offset: 48 },
    '5-gray': { phase: 'poweroff', lights: ['gray', 'gray', 'gray', 'gray', 'gray'], offset: 0 }
  }
};

// 全局状态
let STATE = {
  startTime: new Date(),
  currentPhase: 'reset',
  currentLights: [],
  countdownInterval: null,
  isAdmin: localStorage.getItem('isAdmin') === 'true',
  timerEnabled: true
};
