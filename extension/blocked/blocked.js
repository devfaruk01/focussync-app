// extension/blocked/blocked.js
let timerInterval = null;
let currentQuoteIndex = 0;

const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on the step in front of you, not the whole staircase.", author: "Unknown" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "Where focus goes, energy flows.", author: "Tony Robbins" },
  { text: "Concentrate all your thoughts upon the work at hand.", author: "Alexander Graham Bell" },
  { text: "One reason so few of us achieve what we truly want is that we never direct our focus.", author: "Anthony Robbins" },
  { text: "The ability to focus is the key to success.", author: "Bill Gates" },
  { text: "Lack of direction, not lack of time, is the problem.", author: "Zig Ziglar" },
  { text: "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.", author: "Buddha" }
];

const DOM = {
  timerMinutes: document.getElementById('timerMinutes'),
  timerSeconds: document.getElementById('timerSeconds'),
  quoteText: document.getElementById('quoteText'),
  quoteAuthor: document.getElementById('quoteAuthor'),
  emergencyBtn: document.getElementById('emergencyUnlockBtn')
};

const formatNumber = (num) => {
  return num < 10 ? `0${num}` : `${num}`;
};

const updateTimerDisplay = (remainingSeconds) => {
  if (!DOM.timerMinutes || !DOM.timerSeconds) return;
  
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  
  DOM.timerMinutes.textContent = formatNumber(minutes);
  DOM.timerSeconds.textContent = formatNumber(seconds);
};

const getFocusSessionEndTime = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['focusSessionEndTime'], (result) => {
      resolve(result.focusSessionEndTime || null);
    });
  });
};

const updateRemainingTime = async () => {
  const endTime = await getFocusSessionEndTime();
  
  if (!endTime) {
    updateTimerDisplay(0);
    return;
  }
  
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
  updateTimerDisplay(remainingSeconds);
  
  if (remainingSeconds <= 0) {
    clearTimer();
    await checkFocusModeStatus();
  }
};

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  updateRemainingTime();
  timerInterval = setInterval(updateRemainingTime, 1000);
};

const clearTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};

const rotateQuote = () => {
  if (!DOM.quoteText || !DOM.quoteAuthor) return;
  
  currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
  const quote = quotes[currentQuoteIndex];
  
  if (DOM.quoteText.style) {
    DOM.quoteText.style.opacity = '0';
    setTimeout(() => {
      DOM.quoteText.textContent = quote.text;
      DOM.quoteAuthor.textContent = `- ${quote.author}`;
      DOM.quoteText.style.opacity = '1';
    }, 300);
  } else {
    DOM.quoteText.textContent = quote.text;
    DOM.quoteAuthor.textContent = `- ${quote.author}`;
  }
};

const startQuoteRotation = () => {
  setInterval(rotateQuote, 8000);
};

const checkFocusModeStatus = async () => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (response && !response.focusMode) {
        window.location.href = 'about:blank';
        window.close();
      }
      resolve();
    });
  });
};

const requestEmergencyUnlock = async () => {
  const confirmed = confirm(
    '⚠️ EMERGENCY UNLOCK WARNING ⚠️\n\n' +
    'This action will:\n' +
    '• Temporarily disable focus mode\n' +
    '• Be logged for productivity tracking\n' +
    '• Require re-enabling focus mode manually\n\n' +
    'Are you sure you want to proceed?'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SET_FOCUS_MODE', enabled: false, domains: [] }, resolve);
    });
    
    if (!response || response.error) {
      alert('Failed to unlock. Please try again.');
    } else {
      await chrome.storage.local.remove(['focusSessionEndTime']);
      window.location.href = 'about:blank';
      window.close();
    }
  } catch (error) {
    console.error('Emergency unlock error:', error);
    alert('Error during unlock. Please try again.');
  }
};

const logBlockedVisit = async () => {
  const currentUrl = window.location.href;
  try {
    await chrome.runtime.sendMessage({ 
      type: 'LOG_MANUAL', 
      domain: new URL(currentUrl).hostname,
      duration: 0,
      isBlocked: true
    });
  } catch (error) {
    console.error('Log blocked visit error:', error);
  }
};

const init = async () => {
  await checkFocusModeStatus();
  await logBlockedVisit();
  await startTimer();
  startQuoteRotation();
  
  if (DOM.emergencyBtn) {
    DOM.emergencyBtn.addEventListener('click', requestEmergencyUnlock);
  }
  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FOCUS_MODE_CHANGE' && !message.data.enabled) {
      window.location.href = 'about:blank';
      window.close();
    }
    return true;
  });
};

init().catch(console.error);