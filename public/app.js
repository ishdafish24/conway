(() => {
  // ─── Grid dimensions ──────────────────────────────────────
  const GRID_W = 140;
  const GRID_H = 90;
  const CELL_COUNT = GRID_W * GRID_H;

  // ─── State ────────────────────────────────────────────────
  let grid = new Uint8Array(CELL_COUNT);
  let nextGrid = new Uint8Array(CELL_COUNT);
  let cellSize = 7;
  let generation = 0;
  let population = 0;
  let prevPop = 0;
  let born = 0;
  let died = 0;
  let isPlaying = false;
  let speed = 10;
  let lastStep = 0;
  let drawMode = 'paint';
  let stampPattern = null;
  let mouseDown = false;
  let paintValue = 1;
  let cursorX = -1, cursorY = -1;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let mainLoopStarted = false;

  // ─── DOM refs ─────────────────────────────────────────────
  const canvas = document.getElementById('grid');
  const ctx = canvas.getContext('2d');

  const idx = (x, y) => y * GRID_W + x;

  function getCell(g, x, y) {
    if (x < 0) x += GRID_W; else if (x >= GRID_W) x -= GRID_W;
    if (y < 0) y += GRID_H; else if (y >= GRID_H) y -= GRID_H;
    return g[idx(x, y)];
  }

  function setCell(g, x, y, v) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    g[idx(x, y)] = v;
  }

  // ─── Simulation step ──────────────────────────────────────
  function step() {
    born = 0; died = 0;
    let nextPop = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let n = 0;
        n += getCell(grid, x-1, y-1) + getCell(grid, x, y-1) + getCell(grid, x+1, y-1);
        n += getCell(grid, x-1, y)   +                       getCell(grid, x+1, y);
        n += getCell(grid, x-1, y+1) + getCell(grid, x, y+1) + getCell(grid, x+1, y+1);
        const cur = grid[idx(x, y)];
        let nxt = 0;
        if (cur === 1) {
          if (n === 2 || n === 3) { nxt = 1; nextPop++; }
          else died++;
        } else {
          if (n === 3) { nxt = 1; nextPop++; born++; }
        }
        nextGrid[idx(x, y)] = nxt;
      }
    }
    const tmp = grid; grid = nextGrid; nextGrid = tmp;
    generation++;
    prevPop = population;
    population = nextPop;
    updateStats();
  }

  function clearGrid() {
    grid.fill(0); nextGrid.fill(0);
    generation = 0; population = 0; born = 0; died = 0; prevPop = 0;
    updateStats(); render();
  }

  function randomize() {
    for (let i = 0; i < CELL_COUNT; i++) {
      grid[i] = Math.random() < 0.28 ? 1 : 0;
    }
    generation = 0; born = 0; died = 0;
    countPop(); updateStats(); render();
  }

  function countPop() {
    let p = 0;
    for (let i = 0; i < CELL_COUNT; i++) if (grid[i]) p++;
    population = p;
  }

  function updateStats() {
    document.getElementById('stat-gen').textContent = generation.toLocaleString();
    document.getElementById('stat-pop').textContent = population.toLocaleString();
    const density = (population / CELL_COUNT) * 100;
    document.getElementById('stat-density').textContent = density.toFixed(2) + '%';
    document.getElementById('stat-born').textContent = born.toLocaleString();
    document.getElementById('stat-died').textContent = died.toLocaleString();
    const delta = Math.abs(population - prevPop);
    let stability = '—';
    if (generation > 3) {
      if (delta === 0) stability = 'STATIC';
      else if (delta < 5) stability = 'STABLE';
      else if (delta < 50) stability = 'EVOLVING';
      else stability = 'CHAOTIC';
    }
    document.getElementById('stat-stable').textContent = stability;
  }

  // ─── Render ───────────────────────────────────────────────
  function render() {
    const w = GRID_W * cellSize;
    const h = GRID_H * cellSize;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // hairline grid
    if (cellSize >= 5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= GRID_W; x++) {
        ctx.moveTo(x * cellSize + 0.5, 0);
        ctx.lineTo(x * cellSize + 0.5, h);
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.moveTo(0, y * cellSize + 0.5);
        ctx.lineTo(w, y * cellSize + 0.5);
      }
      ctx.stroke();
    }

    // living cells
    ctx.fillStyle = '#00D4FF';
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[idx(x, y)]) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }

    // cursor highlight
    if (cursorX >= 0 && cursorY >= 0) {
      ctx.strokeStyle = 'rgba(0,212,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cursorX * cellSize + 0.5, cursorY * cellSize + 0.5, cellSize - 1, cellSize - 1);
    }
  }

  function fitCanvas() {
    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth - 4;
    const maxH = wrap.clientHeight - 4;
    const fitW = Math.floor(maxW / GRID_W);
    const fitH = Math.floor(maxH / GRID_H);
    cellSize = Math.max(3, Math.min(fitW, fitH, 14));
    document.getElementById('zoom-val').textContent = cellSize;
    document.getElementById('zoom').value = cellSize;
    render();
  }

  // ─── Mouse / touch ────────────────────────────────────────
  function eventToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / rect.width * GRID_W);
    const y = Math.floor((clientY - rect.top) / rect.height * GRID_H);
    return {
      x: Math.max(0, Math.min(GRID_W - 1, x)),
      y: Math.max(0, Math.min(GRID_H - 1, y))
    };
  }

  function handlePointerDown(clientX, clientY) {
    const { x, y } = eventToCell(clientX, clientY);
    if (drawMode === 'stamp' && stampPattern) {
      stampPatternAt(stampPattern, x, y);
    } else {
      paintValue = grid[idx(x, y)] ? 0 : 1;
      setCell(grid, x, y, paintValue);
      countPop(); updateStats(); render();
    }
    mouseDown = true;
  }

  function handlePointerMove(clientX, clientY) {
    const { x, y } = eventToCell(clientX, clientY);
    if (cursorX !== x || cursorY !== y) {
      cursorX = x; cursorY = y;
      document.getElementById('cursor-x').textContent = String(x).padStart(3, '0');
      document.getElementById('cursor-y').textContent = String(y).padStart(3, '0');
      if (mouseDown && drawMode === 'paint') {
        setCell(grid, x, y, paintValue);
        countPop(); updateStats();
      }
      render();
    }
  }

  canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
  canvas.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('mouseleave', () => { cursorX = -1; cursorY = -1; render(); });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handlePointerDown(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handlePointerMove(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', () => { mouseDown = false; });

  // ─── Controls ─────────────────────────────────────────────
  document.getElementById('btn-play').addEventListener('click', (e) => {
    isPlaying = !isPlaying;
    e.target.textContent = isPlaying ? 'PAUSE' : 'PLAY';
    e.target.classList.toggle('is-playing', isPlaying);
    const status = document.getElementById('stat-status');
    status.textContent = isPlaying ? 'RUNNING' : 'PAUSED';
    status.classList.toggle('live', isPlaying);
    if (isPlaying) lastStep = performance.now();
  });

  document.getElementById('btn-step').addEventListener('click', () => {
    step(); render();
  });
  document.getElementById('btn-clear').addEventListener('click', clearGrid);
  document.getElementById('btn-random').addEventListener('click', randomize);

  document.getElementById('speed').addEventListener('input', (e) => {
    speed = parseInt(e.target.value);
    document.getElementById('speed-val').textContent = speed;
  });

  document.getElementById('zoom').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth - 4;
    const maxH = wrap.clientHeight - 4;
    const fit = Math.max(3, Math.min(Math.floor(maxW / GRID_W), Math.floor(maxH / GRID_H), 14));
    cellSize = Math.min(v, fit);
    document.getElementById('zoom-val').textContent = cellSize;
    render();
  });

  const modeToggle = document.getElementById('mode-toggle');
  const modeStamp = document.getElementById('mode-stamp');
  modeToggle.addEventListener('click', () => {
    drawMode = 'paint';
    modeToggle.classList.add('primary');
    modeStamp.classList.remove('primary');
  });
  modeStamp.addEventListener('click', () => {
    drawMode = 'stamp';
    modeStamp.classList.add('primary');
    modeToggle.classList.remove('primary');
  });

  // ─── Keyboard ─────────────────────────────────────────────
  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-play').click();
      } else if (e.key === 's' || e.key === 'S') {
        document.getElementById('btn-step').click();
      } else if (e.key === 'c' || e.key === 'C') {
        document.getElementById('btn-clear').click();
      } else if (e.key === 'r' || e.key === 'R') {
        document.getElementById('btn-random').click();
      }
    });
  }

  // ─── Main loop ────────────────────────────────────────────
  function loop(t) {
    if (isPlaying) {
      const interval = 1000 / speed;
      if (t - lastStep >= interval) {
        step();
        render();
        lastStep = t;
        frameCount++;
      }
    }
    if (t - lastFpsTime > 1000) {
      document.getElementById('fps').textContent = frameCount;
      frameCount = 0;
      lastFpsTime = t;
    }
    requestAnimationFrame(loop);
  }

  function startMainLoop() {
    if (mainLoopStarted) return;
    mainLoopStarted = true;
    requestAnimationFrame(loop);
  }

  // ─── Patterns ─────────────────────────────────────────────
  const PATTERNS = {
    glider: { name: 'GLIDER', meta: 'SPACESHIP · C/4', cells: [[1,0],[2,1],[0,2],[1,2],[2,2]] },
    blinker: { name: 'BLINKER', meta: 'OSCILLATOR · P2', cells: [[0,0],[1,0],[2,0]] },
    toad: { name: 'TOAD', meta: 'OSCILLATOR · P2', cells: [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1]] },
    beacon: { name: 'BEACON', meta: 'OSCILLATOR · P2', cells: [[0,0],[1,0],[0,1],[3,2],[2,3],[3,3]] },
    pulsar: { name: 'PULSAR', meta: 'OSCILLATOR · P3', cells: [
      [2,0],[3,0],[4,0],[8,0],[9,0],[10,0],
      [0,2],[5,2],[7,2],[12,2],
      [0,3],[5,3],[7,3],[12,3],
      [0,4],[5,4],[7,4],[12,4],
      [2,5],[3,5],[4,5],[8,5],[9,5],[10,5],
      [2,7],[3,7],[4,7],[8,7],[9,7],[10,7],
      [0,8],[5,8],[7,8],[12,8],
      [0,9],[5,9],[7,9],[12,9],
      [0,10],[5,10],[7,10],[12,10],
      [2,12],[3,12],[4,12],[8,12],[9,12],[10,12]
    ]},
    pentadecathlon: { name: 'PENTADECATHLON', meta: 'OSCILLATOR · P15', cells: [
      [1,0],[1,1],[0,2],[2,2],[1,3],[1,4],[1,5],[1,6],[0,7],[2,7],[1,8],[1,9]
    ]},
    glidergun: { name: 'GOSPER GUN', meta: 'GUN · P30', cells: [
      [24,0],
      [22,1],[24,1],
      [12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
      [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
      [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
      [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
      [10,6],[16,6],[24,6],
      [11,7],[15,7],
      [12,8],[13,8]
    ]},
    lwss: { name: 'LWSS', meta: 'SPACESHIP · C/2', cells: [[1,0],[4,0],[0,1],[0,2],[4,2],[0,3],[1,3],[2,3],[3,3]] },
    rpentomino: { name: 'R-PENTOMINO', meta: 'METHUSELAH', cells: [[1,0],[2,0],[0,1],[1,1],[1,2]] },
    acorn: { name: 'ACORN', meta: 'METHUSELAH', cells: [[1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2]] },
    block: { name: 'BLOCK', meta: 'STILL LIFE', cells: [[0,0],[1,0],[0,1],[1,1]] },
    beehive: { name: 'BEEHIVE', meta: 'STILL LIFE', cells: [[1,0],[2,0],[0,1],[3,1],[1,2],[2,2]] }
  };

  function stampPatternAt(pattern, cx, cy) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pattern.cells.forEach(([x, y]) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
    const pw = maxX - minX + 1;
    const ph = maxY - minY + 1;
    const ox = cx - Math.floor(pw / 2) - minX;
    const oy = cy - Math.floor(ph / 2) - minY;
    pattern.cells.forEach(([x, y]) => setCell(grid, x + ox, y + oy, 1));
    countPop(); updateStats(); render();
  }

  function renderPatternThumb(cv, pattern) {
    const tctx = cv.getContext('2d');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pattern.cells.forEach(([x, y]) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
    const pw = maxX - minX + 1;
    const ph = maxY - minY + 1;
    const pad = 4;
    const cell = Math.max(1, Math.floor(Math.min((cv.width - pad*2) / pw, (cv.height - pad*2) / ph)));
    const totalW = cell * pw, totalH = cell * ph;
    const offX = (cv.width - totalW) / 2 - minX * cell;
    const offY = (cv.height - totalH) / 2 - minY * cell;
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, cv.width, cv.height);
    tctx.fillStyle = '#00D4FF';
    pattern.cells.forEach(([x, y]) => {
      tctx.fillRect(offX + x * cell, offY + y * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
    });
  }

  function buildPatternLibrary() {
    const container = document.getElementById('pattern-grid');
    Object.entries(PATTERNS).forEach(([key, pat]) => {
      const btn = document.createElement('button');
      btn.className = 'pattern-btn';
      btn.dataset.pattern = key;
      btn.innerHTML = `
        <canvas class="pattern-canvas" width="130" height="80"></canvas>
        <span class="pattern-name">${pat.name}</span>
        <span class="pattern-meta">${pat.meta}</span>
      `;
      container.appendChild(btn);
      renderPatternThumb(btn.querySelector('canvas'), pat);
      btn.addEventListener('click', () => {
        stampPatternAt(pat, Math.floor(GRID_W / 2), Math.floor(GRID_H / 2));
        stampPattern = pat;
        drawMode = 'stamp';
        modeStamp.classList.add('primary');
        modeToggle.classList.remove('primary');
      });
    });
  }

  // ─── Rule mini-canvases ───────────────────────────────────
  const ruleStates = {
    underpop: { grid: new Uint8Array(25), stepCount: 0 },
    survival: { grid: new Uint8Array(25), stepCount: 0 },
    overpop:  { grid: new Uint8Array(25), stepCount: 0 },
    repro:    { grid: new Uint8Array(25), stepCount: 0 },
  };

  function setupRule(name) {
    const s = ruleStates[name];
    s.grid.fill(0);
    s.stepCount = 0;
    if (name === 'underpop') {
      s.grid[2*5+2] = 1; s.grid[2*5+1] = 1;
    } else if (name === 'survival') {
      s.grid[2*5+2] = 1; s.grid[1*5+1] = 1; s.grid[3*5+3] = 1;
    } else if (name === 'overpop') {
      s.grid[2*5+2] = 1; s.grid[2*5+1] = 1; s.grid[2*5+3] = 1;
      s.grid[1*5+2] = 1; s.grid[3*5+2] = 1;
    } else if (name === 'repro') {
      s.grid[1*5+1] = 1; s.grid[1*5+3] = 1; s.grid[3*5+2] = 1;
    }
  }

  function getMini(g, x, y) {
    if (x < 0) x += 5; else if (x >= 5) x -= 5;
    if (y < 0) y += 5; else if (y >= 5) y -= 5;
    return g[y*5+x];
  }

  function stepMini(state, name) {
    const g = state.grid;
    const next = new Uint8Array(25);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        let n = 0;
        n += getMini(g, x-1, y-1) + getMini(g, x, y-1) + getMini(g, x+1, y-1);
        n += getMini(g, x-1, y)   +                       getMini(g, x+1, y);
        n += getMini(g, x-1, y+1) + getMini(g, x, y+1) + getMini(g, x+1, y+1);
        const cur = g[y*5+x];
        let nxt = 0;
        if (cur === 1) {
          if (n === 2 || n === 3) nxt = 1;
        } else {
          if (n === 3) nxt = 1;
        }
        next[y*5+x] = nxt;
      }
    }
    state.stepCount++;
    if (state.stepCount >= 2) {
      setupRule(name);
    } else {
      state.grid = next;
    }
  }

  function renderRule(cv, state) {
    const rctx = cv.getContext('2d');
    const cell = 28;
    rctx.fillStyle = '#000';
    rctx.fillRect(0, 0, cv.width, cv.height);

    rctx.strokeStyle = 'rgba(255,255,255,0.05)';
    rctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      rctx.beginPath();
      rctx.moveTo(i * cell + 0.5, 0); rctx.lineTo(i * cell + 0.5, 5 * cell);
      rctx.stroke();
      rctx.beginPath();
      rctx.moveTo(0, i * cell + 0.5); rctx.lineTo(5 * cell, i * cell + 0.5);
      rctx.stroke();
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isCenter = (x === 2 && y === 2);
        const isAlive = state.grid[y*5+x];
        if (isCenter) {
          if (isAlive) {
            rctx.fillStyle = '#00D4FF';
            rctx.fillRect(x*cell+4, y*cell+4, cell-8, cell-8);
            rctx.strokeStyle = '#00D4FF';
            rctx.lineWidth = 1.5;
            rctx.strokeRect(x*cell+1.5, y*cell+1.5, cell-3, cell-3);
          } else {
            rctx.strokeStyle = 'rgba(0,212,255,0.55)';
            rctx.setLineDash([3, 3]);
            rctx.lineWidth = 1;
            rctx.strokeRect(x*cell+3.5, y*cell+3.5, cell-7, cell-7);
            rctx.setLineDash([]);
          }
        } else if (isAlive) {
          rctx.fillStyle = 'rgba(0,212,255,0.35)';
          rctx.fillRect(x*cell+6, y*cell+6, cell-12, cell-12);
        }
      }
    }
  }

  function startRuleLoop() {
    const canvases = document.querySelectorAll('.rule-canvas');
    canvases.forEach(c => setupRule(c.dataset.rule));
    canvases.forEach(c => renderRule(c, ruleStates[c.dataset.rule]));
    let last = performance.now();
    function tick(t) {
      if (t - last > 900) {
        canvases.forEach(c => {
          const name = c.dataset.rule;
          stepMini(ruleStates[name], name);
          renderRule(c, ruleStates[name]);
        });
        last = t;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Custom cursor ────────────────────────────────────────
  function setupCursor() {
    const dot = document.getElementById('cursor-dot');
    if ('ontouchstart' in window || !window.matchMedia('(pointer: fine)').matches) {
      dot.style.display = 'none';
      document.body.style.cursor = 'auto';
      return;
    }
    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };
    let hover = false;

    window.addEventListener('mousemove', (e) => {
      target.x = e.clientX; target.y = e.clientY;
    });

    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('a, button, [data-cursor-hover], .pattern-row, .pattern-btn, input')) hover = true;
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('a, button, [data-cursor-hover], .pattern-row, .pattern-btn, input')) hover = false;
    });

    function loop() {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      const s = hover ? 36 : 4;
      dot.style.transform = `translate(${pos.x - s/2}px, ${pos.y - s/2}px)`;
      dot.style.width = s + 'px';
      dot.style.height = s + 'px';
      dot.style.background = hover ? 'transparent' : '#fff';
      dot.style.borderWidth = (hover ? 1.5 : 0) + 'px';
      dot.style.borderColor = hover ? 'rgba(0,212,255,0.7)' : 'transparent';
      dot.style.mixBlendMode = hover ? 'normal' : 'difference';
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ─── Hero scramble ────────────────────────────────────────
  function scrambleTitle() {
    const TARGET = "CONWAY'S GAME OF LIFE";
    const CHARS = '!<>-_\\/[]{}—=+*^?#01';
    const el = document.getElementById('hero-title');
    let iter = 0;
    const total = TARGET.length * 6;
    el.classList.add('is-decoding');
    function tick() {
      el.textContent = TARGET.split('').map((ch, i) => {
        if (ch === ' ') return ' ';
        if (i < iter / 6) return TARGET[i];
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      }).join('');
      iter++;
      if (iter >= total) {
        el.textContent = TARGET;
        el.classList.remove('is-decoding');
        return;
      }
      setTimeout(tick, 38);
    }
    tick();
  }

  // ─── Headline enter ───────────────────────────────────────
  function setupHeadlineEnter() {
    const els = document.querySelectorAll('.headline-enter');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => obs.observe(el));
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    document.getElementById('year').textContent = new Date().getFullYear();

    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    // Seed: pulsar center, two gliders
    stampPatternAt(PATTERNS.pulsar, 70, 45);
    stampPatternAt(PATTERNS.glider, 18, 18);
    stampPatternAt(PATTERNS.glider, 18, 70);

    buildPatternLibrary();
    startRuleLoop();

    setupHeadlineEnter();
    scrambleTitle();
    setupKeyboard();
    setupCursor();

    startMainLoop();

    // Auto-play after scramble settles
    setTimeout(() => {
      if (!isPlaying) document.getElementById('btn-play').click();
    }, 2800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();