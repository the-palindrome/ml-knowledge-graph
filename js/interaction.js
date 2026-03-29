// Mouse and touch interaction handling
// Tracks mousedown position to distinguish clicks from drags (orbit rotation).

const MOVE_THROTTLE = 33; // ~30fps
const DRAG_THRESHOLD = 5; // px — movement beyond this is a drag, not a click

let lastMoveTime = 0;
let downX = 0;
let downY = 0;

function recordPointerDown(event) {
  downX = event.clientX;
  downY = event.clientY;
}

function isDragFromPointerDown(event) {
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  return dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD;
}

function getEventNdc(container, event) {
  const rect = container.getBoundingClientRect();
  return {
    mx: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    my: ((event.clientY - rect.top) / rect.height) * -2 + 1,
  };
}

export function setupInteraction(container, getNodeAtScreen, callbacks) {
  let clickTimeout = null;

  // Record mouse-down position
  container.addEventListener('mousedown', recordPointerDown);

  // Hover (throttled)
  container.addEventListener('mousemove', (event) => {
    const now = performance.now();
    if (now - lastMoveTime < MOVE_THROTTLE) return;
    lastMoveTime = now;

    const { mx, my } = getEventNdc(container, event);
    const nodeId = getNodeAtScreen(mx, my);
    callbacks.onHover(nodeId, event.clientX, event.clientY);
  });

  // Click — only fires if the mouse didn't move (not a drag/orbit)
  container.addEventListener('click', (event) => {
    if (isDragFromPointerDown(event)) return; // was a drag
    const appendToSelection = event.shiftKey;

    const { mx, my } = getEventNdc(container, event);
    const nodeId = getNodeAtScreen(mx, my);

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    clickTimeout = setTimeout(() => {
      clickTimeout = null;
      if (nodeId) {
        callbacks.onClick(nodeId, {
          appendToSelection,
        });
      } else {
        callbacks.onEmptyClick();
      }
    }, 250);
  });

  // Double-click — same drag guard
  container.addEventListener('dblclick', (event) => {
    if (isDragFromPointerDown(event)) return;

    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    const { mx, my } = getEventNdc(container, event);
    const nodeId = getNodeAtScreen(mx, my);
    if (nodeId) {
      callbacks.onDblClick(nodeId);
    }
  });
}
