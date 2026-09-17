const viewer = document.querySelector('#image-viewer');
const viewerImage = document.querySelector('#viewer-image');
const viewerCaption = document.querySelector('#viewer-caption');
const closeButton = document.querySelector('.viewer-close');
const zoomables = document.querySelectorAll('.zoomable');
const routeSurfaces = document.querySelectorAll('.route-card, .museum-jump, .plan-block, .museum-card');
const routeButtons = document.querySelectorAll('.route-select');
const noteFields = document.querySelectorAll('.section-notes');

function selectRoute(route) {
  routeSurfaces.forEach((surface) => {
    const selected = surface.dataset.route === route;
    surface.classList.toggle('is-selected', selected);
    if (surface.classList.contains('museum-jump')) {
      surface.setAttribute('aria-current', selected ? 'true' : 'false');
    }
  });

  routeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.route === route ? 'true' : 'false');
  });
}

document.querySelectorAll('.museum-jump').forEach((link) => {
  link.addEventListener('click', () => selectRoute(link.dataset.route));
});

routeButtons.forEach((button) => {
  button.addEventListener('click', () => selectRoute(button.dataset.route));
});

document.querySelectorAll('.route-option').forEach((surface) => {
  surface.addEventListener('click', (event) => {
    if (event.target.closest('.route-select, .zoomable, a')) return;
    selectRoute(surface.dataset.route);
  });
});

const initialRoute = window.location.hash.match(/^#museum-([ac])$/)?.[1];
if (initialRoute) selectRoute(initialRoute);

function openViewer(source) {
  viewerImage.src = source.currentSrc || source.src;
  viewerImage.alt = source.alt;
  viewerCaption.textContent = source.dataset.caption || source.alt;
  viewer.showModal();
  document.body.classList.add('viewer-open');
}

function closeViewer() {
  if (viewer.open) viewer.close();
}

zoomables.forEach((image) => {
  image.addEventListener('click', () => openViewer(image));
  image.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openViewer(image);
    }
  });
});

closeButton.addEventListener('click', closeViewer);
viewerImage.addEventListener('click', closeViewer);
viewer.addEventListener('click', (event) => {
  if (event.target === viewer) closeViewer();
});
viewer.addEventListener('close', () => {
  document.body.classList.remove('viewer-open');
  viewerImage.src = '';
});

function resizeNote(input) {
  input.style.height = 'auto';
  input.style.height = `${Math.max(input.scrollHeight, 42)}px`;
}

function setNoteStatus(surface, message) {
  const status = surface.querySelector('.notes-status');
  if (status) status.textContent = message;
}

async function loadNotes() {
  try {
    const response = await fetch('/api/notes', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('notes unavailable');
    const payload = await response.json();
    const notes = payload.notes || {};
    noteFields.forEach((surface) => {
      const input = surface.querySelector('.section-note-input');
      if (!input) return;
      input.value = typeof notes[surface.dataset.noteSection] === 'string' ? notes[surface.dataset.noteSection] : '';
      resizeNote(input);
      setNoteStatus(surface, '已同步 · 支持跨设备保存');
    });
  } catch (error) {
    noteFields.forEach((surface) => setNoteStatus(surface, '暂时无法连接保存'));
  }
}

const noteTimers = new WeakMap();
function queueNoteSave(surface, input) {
  const previousTimer = noteTimers.get(input);
  if (previousTimer) window.clearTimeout(previousTimer);
  setNoteStatus(surface, '保存中…');
  const timer = window.setTimeout(async () => {
    try {
      const response = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sectionId: surface.dataset.noteSection, content: input.value }),
      });
      if (!response.ok) throw new Error('save failed');
      setNoteStatus(surface, '已保存 · 其他设备可见');
    } catch (error) {
      setNoteStatus(surface, '保存失败，请稍后重试');
    }
  }, 650);
  noteTimers.set(input, timer);
}

noteFields.forEach((surface) => {
  const input = surface.querySelector('.section-note-input');
  if (!input) return;
  resizeNote(input);
  input.addEventListener('input', () => {
    resizeNote(input);
    queueNoteSave(surface, input);
  });
});

loadNotes();
