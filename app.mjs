import { PEOPLE, sanitizeDraws, chooseCandidate, commitDraw, angleForWinner } from './draw-model.mjs';

const STORAGE_KEY = 'huanle-vau:draws:v1';
const SOUND_KEY = 'huanle-vau:sound:v1';
const COLORS = ['#ffd0af', '#d8e2c5', '#ffe9a0', '#ffd0af', '#ffe9a0', '#ffd0af', '#d8e2c5', '#ffe9a0'];
const DOT_COLORS = ['#ffbc91', '#aebb8c', '#f8d875', '#ffbc91', '#f8d875', '#ffbc91', '#aebb8c', '#f8d875'];
const $ = (selector) => document.querySelector(selector);
const refs = {
  svg: $('#wheel-svg'), rotor: $('#wheel-rotor'), hub: $('#hub-button'), hubText: $('#hub-text'),
  spin: $('#spin-button'), reroll: $('#reroll-button'), reset: $('#reset-button'),
  ticket: $('#result-ticket'), name: $('#winner-name'), label: $('#result-label'), subtitle: $('#result-subtitle'), help: $('#reroll-help'),
  roster: $('#roster'), remaining: $('#remaining-count'), history: $('#history-list'), empty: $('#history-empty'),
  sound: $('#sound-button'), toast: $('#toast'), resetDialog: $('#reset-dialog'), shareDialog: $('#share-dialog')
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let storageWritable = true;
let draws = readSavedDraws();
let soundEnabled = readSetting(SOUND_KEY) !== 'off';
let isSpinning = false;
let rotation = draws.length ? angleForWinner(0, PEOPLE.findIndex(p => p.id === draws.at(-1)), 0, 1) % 360 : 0;
let spinVersion = 0;
let toastTimer;
let audioContext;
let confettiFrame;
let celebrationTimer;
let wheelLabels = [];

function readSetting(key) { try { return localStorage.getItem(key); } catch { return null; } }
function readSavedDraws() {
  try { return sanitizeDraws(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draws)); storageWritable = true; }
  catch { storageWritable = false; $('#save-note').textContent = '本次进度仅在当前页面保留'; showToast('浏览器未允许保存进度，请保持此页面打开'); }
}
function showToast(message) {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add('visible');
  toastTimer = setTimeout(() => refs.toast.classList.remove('visible'), 3400);
}

function point(angle, radius = 285) {
  const radians = angle * Math.PI / 180;
  return { x: 300 + Math.cos(radians) * radius, y: 300 + Math.sin(radians) * radius };
}
function renderWheel() {
  const picked = new Set(draws);
  let markup = '<circle cx="300" cy="300" r="298" fill="#fffdf9"/>';
  PEOPLE.forEach((person, index) => {
    const a = -112.5 + index * 45;
    const start = point(a), end = point(a + 45);
    const label = point(a + 22.5, 197);
    const isPicked = picked.has(person.id);
    markup += `<path class="wheel-wedge" d="M300 300 L${start.x} ${start.y} A285 285 0 0 1 ${end.x} ${end.y} Z" fill="${isPicked ? '#e8e4dc' : COLORS[index]}" stroke="#fffdf9" stroke-width="2.4"/>`;
    markup += `<text class="wheel-label${isPicked ? ' picked' : ''}" x="${label.x}" y="${label.y}" data-x="${label.x}" data-y="${label.y}">${person.name}</text>`;
    const peg = point(a, 289);
    markup += `<circle cx="${peg.x}" cy="${peg.y}" r="5" fill="#f57b5d" stroke="#fffdf9" stroke-width="3"/>`;
  });
  refs.svg.innerHTML = markup;
  wheelLabels = [...refs.svg.querySelectorAll('.wheel-label')];
  applyRotation(rotation);
}
function applyRotation(degrees) {
  rotation = degrees;
  refs.rotor.style.transform = `rotate(${degrees}deg)`;
  wheelLabels.forEach(label => label.setAttribute('transform', `rotate(${-degrees} ${label.dataset.x} ${label.dataset.y})`));
}
function renderRoster() {
  refs.roster.innerHTML = PEOPLE.map((person, index) => {
    const rank = draws.indexOf(person.id);
    const current = rank >= 0 && rank === draws.length - 1;
    return `<li class="roster-row${rank >= 0 ? ' is-picked' : ''}${current ? ' is-current' : ''}" style="--person-color:${DOT_COLORS[index]}" aria-label="${person.name}，${rank < 0 ? '待抽取' : `第${rank + 1}位已抽中`}"><span class="person-dot" aria-hidden="true"></span><span class="roster-name">${person.name}</span>${rank >= 0 ? `<span class="person-status">第 ${rank + 1} 位</span><svg class="icon" aria-hidden="true"><use href="#icon-check"/></svg>` : ''}</li>`;
  }).join('');
  refs.remaining.textContent = `待抽 ${PEOPLE.length - draws.length} / ${PEOPLE.length}`;
}
function renderHistory() {
  refs.empty.hidden = draws.length > 0;
  refs.history.hidden = draws.length === 0;
  refs.history.innerHTML = draws.map((id, index) => `<li class="history-item"><span class="history-number">${String(index + 1).padStart(2, '0')}</span><span>${PEOPLE.find(p => p.id === id).name}</span></li>`).join('');
}
function renderControls() {
  const hasResult = draws.length > 0;
  const complete = draws.length === PEOPLE.length;
  refs.spin.disabled = isSpinning || complete;
  refs.hub.disabled = isSpinning || complete;
  refs.reroll.disabled = isSpinning || !hasResult || complete;
  refs.reset.disabled = isSpinning || !hasResult;
  refs.hub.classList.toggle('is-spinning', isSpinning);
  refs.spin.querySelector('span').textContent = isSpinning ? '好运转动中…' : complete ? '全员已抽中' : hasResult ? '抽取下一位' : '开始抽奖';
  refs.hubText.textContent = isSpinning ? '转呀转' : complete ? '圆满啦' : '抽一个';
  refs.hub.setAttribute('aria-label', isSpinning ? '正在抽签' : complete ? '全员已抽中' : hasResult ? '抽取下一位' : '开始抽奖');
  refs.help.textContent = isSpinning ? '好运正在路上，请稍等一下' : complete ? '全员已抽中，重置后可开启新一轮' : hasResult ? '反悔也没关系，重抽只替换这一位' : '抽中过的同学，后续轮次自动跳过';
  refs.reroll.title = complete ? '没有其他待抽同学，无法更换本轮结果' : hasResult ? '撤销本轮结果，换一位同学；之前的记录保留' : '先抽一位同学，再决定是否重抽';
}
function renderResult(status) {
  const latest = PEOPLE.find(p => p.id === draws.at(-1));
  refs.ticket.dataset.status = status || (latest ? (draws.length === PEOPLE.length ? 'done' : 'won') : 'idle');
  refs.label.textContent = latest ? `第 ${draws.length} 位幸运同学` : '下一位幸运同学';
  refs.name.textContent = latest ? latest.name : '会是谁呢？';
  refs.subtitle.textContent = latest ? '下一场 1v1，Dylan 等你来聊' : '和 Dylan 开启一场 1v1';
}
function render() {
  renderWheel(); renderRoster(); renderHistory(); renderResult(); renderControls(); renderSound();
}

function ensureAudio() {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Visual feedback remains available without Web Audio. */ }
}
function tone(frequency, duration = .045, delay = 0, volume = .035, type = 'sine') {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + .005);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.start(start); oscillator.stop(start + duration + .01);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function fanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => tone(frequency, .36, i * .105, .06, 'triangle'));
  [523.25, 659.25, 783.99].forEach(frequency => tone(frequency, .5, .5, .025));
}
function renderSound() {
  refs.sound.setAttribute('aria-pressed', String(soundEnabled));
  refs.sound.setAttribute('aria-label', soundEnabled ? '关闭音效' : '开启音效');
  refs.sound.title = soundEnabled ? '关闭音效' : '开启音效';
  refs.sound.querySelector('use').setAttribute('href', soundEnabled ? '#icon-volume' : '#icon-mute');
}

function spin(reroll = false) {
  if (isSpinning) return;
  const candidate = chooseCandidate(draws, { reroll });
  if (!candidate) return;
  stopCelebration();
  ensureAudio();
  isSpinning = true;
  const token = ++spinVersion;
  const startDraws = [...draws];
  const oldWinner = reroll ? PEOPLE.find(p => p.id === draws.at(-1)) : null;
  refs.ticket.dataset.status = 'spinning';
  refs.name.textContent = '好运转动中';
  refs.label.textContent = reroll ? '本轮重新抽取' : `第 ${draws.length + 1} 位幸运同学`;
  refs.subtitle.textContent = '下一位，会是你吗？';
  renderControls();
  const winnerIndex = PEOPLE.findIndex(p => p.id === candidate.id);
  const startRotation = rotation;
  const jitter = (Math.random() - .5) * 14;
  const target = angleForWinner(rotation, winnerIndex, jitter, 6);
  const duration = reducedMotion.matches ? 350 : 4850;
  const started = performance.now();
  let lastTick = Math.floor(rotation / 45);

  function frame(now) {
    if (token !== spinVersion) return;
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    const degrees = startRotation + (target - startRotation) * eased;
    applyRotation(degrees);
    const tick = Math.floor((degrees + 22.5) / 45);
    if (tick !== lastTick && !reducedMotion.matches) { tone(600 + (progress * 230), .035, 0, .026, 'triangle'); lastTick = tick; }
    if (progress < 1) { requestAnimationFrame(frame); return; }
    // Honor a completed round in another tab before committing this one.
    let latestDraws = startDraws;
    try { if (storageWritable) latestDraws = sanitizeDraws(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { /* Keep the in-memory round when storage is unavailable. */ }
    if (JSON.stringify(latestDraws) !== JSON.stringify(startDraws)) {
      draws = latestDraws; isSpinning = false;
      rotation = draws.length ? angleForWinner(0, PEOPLE.findIndex(p => p.id === draws.at(-1)), 0, 1) % 360 : 0;
      render(); showToast('其他标签页已更新抽签进度，已为你同步');
      return;
    }
    draws = commitDraw(startDraws, candidate.id, { reroll });
    isSpinning = false;
    rotation = target % 360;
    save();
    render();
    fanfare();
    celebrate();
    if (oldWinner) showToast(`已改抽 ${candidate.name}，${oldWinner.name} 回到待抽名单`);
    if (draws.length === PEOPLE.length) showToast('8 位同学全部抽中，每个人都有一场好聊！');
    if (document.activeElement === refs.spin && refs.spin.disabled) refs.reset.focus({ preventScroll: true });
  }
  requestAnimationFrame(frame);
}

function stopCelebration() {
  cancelAnimationFrame(confettiFrame);
  clearTimeout(celebrationTimer);
  $('.wheel-stage').classList.remove('is-celebrating');
  const canvas = $('#confetti');
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}
function celebrate() {
  $('.wheel-stage').classList.add('is-celebrating');
  celebrationTimer = setTimeout(() => $('.wheel-stage').classList.remove('is-celebrating'), 2500);
  const canvas = $('#confetti');
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = innerWidth, height = innerHeight, pixelRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * pixelRatio; canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const total = reducedMotion.matches ? 35 : 165;
  const colors = ['#ed5b46', '#ffd16a', '#a5b981', '#ffb992', '#e39d6c', '#fff6df'];
  const pieces = Array.from({ length: total }, (_, i) => {
    const left = i % 2 === 0;
    return { x: reducedMotion.matches ? Math.random() * width : left ? width * .08 : width * .92,
      y: reducedMotion.matches ? Math.random() * height : height * .65,
      vx: (left ? 1 : -1) * (2 + Math.random() * 7), vy: -(8 + Math.random() * 12),
      size: 5 + Math.random() * 6, angle: Math.random() * Math.PI, spin: (Math.random() - .5) * .2,
      color: colors[i % colors.length], round: i % 5 === 0 };
  });
  const start = performance.now();
  let previous = start;
  const lifetime = reducedMotion.matches ? 1100 : 3900;
  function animate(now) {
    const elapsed = now - start;
    const delta = Math.min((now - previous) / 16.667, 2);
    previous = now;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - lifetime * .65) / (lifetime * .35));
    pieces.forEach(p => {
      if (!reducedMotion.matches) { p.x += p.vx * delta; p.y += p.vy * delta; p.vy += .23 * delta; p.vx *= Math.pow(.993, delta); p.angle += p.spin * delta; }
      context.save(); context.translate(p.x, p.y); context.rotate(p.angle); context.fillStyle = p.color;
      if (p.round) { context.beginPath(); context.arc(0, 0, p.size / 2.5, 0, Math.PI * 2); context.fill(); }
      else context.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .58);
      context.restore();
    });
    if (elapsed < lifetime) confettiFrame = requestAnimationFrame(animate);
    else context.clearRect(0, 0, width, height);
  }
  confettiFrame = requestAnimationFrame(animate);
}

function shareUrl() { return `${location.origin}${location.pathname}`; }
async function copyLink() {
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); showToast('链接已复制，发给同事一起试试'); return true; }
  catch { return false; }
}
refs.spin.addEventListener('click', () => spin());
refs.hub.addEventListener('click', () => spin());
refs.reroll.addEventListener('click', () => spin(true));
refs.reset.addEventListener('click', () => {
  if (!isSpinning && draws.length) {
    refs.resetDialog.returnValue = '';
    refs.resetDialog.showModal();
  }
});
refs.resetDialog.addEventListener('close', () => {
  if (refs.resetDialog.returnValue !== 'reset' || isSpinning) return;
  stopCelebration(); draws = []; rotation = 0; save(); render();
  showToast('全部重置，8 位同学重新加入抽签');
  refs.spin.focus({ preventScroll: true });
});
refs.sound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* In-memory setting is sufficient. */ }
  renderSound();
  if (soundEnabled) { ensureAudio(); tone(660, .12); }
});
$('#share-button').addEventListener('click', async () => {
  if (navigator.share && matchMedia('(max-width: 800px)').matches) {
    try { await navigator.share({ title: '欢乐VAU', text: '今天，谁和 Dylan 聊聊？转动轮盘，把好运分享出去。', url: shareUrl() }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  if (await copyLink()) return;
  $('#share-url').value = shareUrl();
  refs.shareDialog.showModal();
  $('#share-url').select();
});
$('#copy-link-button').addEventListener('click', async () => {
  if (await copyLink()) { refs.shareDialog.close(); return; }
  $('#share-url').focus(); $('#share-url').select();
  try { if (document.execCommand('copy')) { refs.shareDialog.close(); showToast('链接已复制'); return; } } catch { /* Keep selected URL available. */ }
  showToast('链接已选中，请长按复制或使用 Ctrl/Cmd + C');
});
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    const previous = JSON.stringify(draws);
    const updated = readSavedDraws();
    if (JSON.stringify(updated) === previous) return;
    spinVersion++; isSpinning = false; stopCelebration(); draws = updated;
    rotation = draws.length ? angleForWinner(0, PEOPLE.findIndex(p => p.id === draws.at(-1)), 0, 1) % 360 : 0;
    render(); showToast('已同步此浏览器其他标签页的抽签进度');
  }
  if (event.key === SOUND_KEY) { soundEnabled = readSetting(SOUND_KEY) !== 'off'; renderSound(); }
});
window.addEventListener('resize', stopCelebration, { passive: true });
render();
