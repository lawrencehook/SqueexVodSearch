// const HOST = 'http://localhost:3003';
const HOST = 'https://server.lawrencehook.com/SqueexVodSearch';

function sendHTTPRequest(type, url, jsonParams, { token, raw=false }={}) {
  const request = new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(type, url, true);

    if (jsonParams) {
      req.setRequestHeader('Content-Type', 'application/json');
      req.send(JSON.stringify(jsonParams));
    } else {
      req.send(null);
    }

    // Successful response
    req.addEventListener('load', res => {
      if (raw) {
        resolve(req);
      } else {
        resolve(req.response);
      }
    });

    // Error response
    req.addEventListener('error', res => {
      reject('HTTP Error');
    });
  });

  return request;
}

function sendRequest(word) {
  const url = HOST + '/' + word;
  const request = sendHTTPRequest('GET', url, null);
  return request;
}

const vidContainerTemplate = qs('#template-video-container');
const segmentTemplate = qs('#segment-template');
const resultsContainer = qs('#results-container');
const ctx = qs('#barchart');
const spinner = qs('#loading-spinner');
const scrollLeftBtn = qs('.results-scroll.left');
const scrollRightBtn = qs('.results-scroll.right');
let chart;
let currentWord = '';
let chartDays = [];
let chartVideoIds = []; // Maps bar index to array of video IDs for that date
let chartGlobalMin = null;
let chartGlobalMax = null;
let hoverDateX = null;

const hoverDatePlugin = {
  id: 'hoverDate',
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === 'mousemove' && args.inChartArea) {
      hoverDateX = event.x;
    } else if (event.type === 'mouseout') {
      hoverDateX = null;
    }
    chart.draw();
  },
  afterDraw(chart) {
    if (hoverDateX === null) return;
    const xScale = chart.scales.x;
    const dateVal = xScale.getValueForPixel(hoverDateX);
    if (!dateVal) return;
    const date = new Date(dateVal);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const ctx = chart.ctx;
    const colors = getChartColors();
    ctx.save();
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.fillText(label, hoverDateX, chart.chartArea.bottom + 14);
    ctx.restore();
  }
};

// Generic horizontal scroll button setup
function setupScrollButtons(container, leftBtn, rightBtn, scrollAmount) {
  leftBtn.addEventListener('click', () => {
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });
  rightBtn.addEventListener('click', () => {
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });
  leftBtn.addEventListener('dblclick', () => {
    container.scrollTo({ left: 0, behavior: 'smooth' });
  });
  rightBtn.addEventListener('dblclick', () => {
    container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
  });
  function update() {
    const { scrollLeft, scrollWidth, clientWidth } = container;
    leftBtn.classList.toggle('visible', scrollLeft > 0);
    rightBtn.classList.toggle('visible', scrollLeft + clientWidth < scrollWidth - 1);
  }
  container.addEventListener('scroll', update);
  new ResizeObserver(update).observe(container);
  return update;
}

const updateResultsScroll = setupScrollButtons(resultsContainer, scrollLeftBtn, scrollRightBtn, 320);

function filterVideosByChartRange() {
  if (!chart) return;
  const xScale = chart.scales.x;
  const visMin = xScale.min;
  const visMax = xScale.max;
  resultsContainer.querySelectorAll('.video-container').forEach(card => {
    const date = Number(card.getAttribute('data-upload-date'));
    if (!date) return;
    card.style.display = (date >= visMin && date <= visMax) ? '' : 'none';
  });
  updateResultsScroll();
}

// Suggestion scroll buttons
const suggestionsContainer = qs('#suggestions');
const sugScrollLeft = qs('.suggestions-scroll.left');
const sugScrollRight = qs('.suggestions-scroll.right');
const updateSuggestionsScroll = setupScrollButtons(suggestionsContainer, sugScrollLeft, sugScrollRight, 200);

function handleResponse(res) {
  spinner.classList.remove('active');
  let parsed;
  try {
    parsed = JSON.parse(res);
  } catch(error) {
    let info = `No results for "${qs('input').value}". `;
    info += `Common words and swears (decided by YT) are excluded. `;
    info += `Queries can only contain dictionary words (try squeaks instead of squeex). `;
    qs('#info-message').innerText = info;
    console.log(error);
    return;
  }
  const { word, segments, meta, updatedAt } = parsed;

  if (!word) {
    let info = `No results for "${qs('input').value}". `;
    info += `Common words and swears (decided by YT) are excluded.`;
    qs('#info-message').innerText = info;
    qs('#search-stats').classList.remove('visible');
    return;
  }

  currentWord = word;

  // Show when data was last updated
  const totalMentions = Object.values(segments).reduce((acc, vidSegments) => {
    return acc + vidSegments.reduce((acc, [time, text]) => {
      return acc + (text.match(new RegExp(escapeRegExp(word), 'ig')) || []).length;
    }, 0)
  }, 0);
  qs('#info-message').innerText = '';
  const statsMain = qs('#stats-main');
  const statsUpdated = qs('#stats-updated');
  const videoCount = Object.keys(segments).length;
  statsMain.innerHTML = `<span class="stats-word">${word}</span> <strong>${totalMentions}</strong> mentions across <strong>${videoCount}</strong> videos`;
  statsUpdated.textContent = `Updated ${formatDate(updatedAt)}`;
  qs('#search-stats').classList.add('visible');

  // Empty out the results container.
  Array.from(resultsContainer.childNodes).forEach(n => {
    if (n.id === 'template-video-container') return;
    n.remove();
  })

  // Sort segments by date (oldest first, left to right)
  const segmentEntries = Object.entries(segments);
  segmentEntries.sort((a, b) => {
    const aDate = new Date(meta[a[0]].upload_date);
    const bDate = new Date(meta[b[0]].upload_date);
    return aDate.getTime() - bDate.getTime();
  });

  segmentEntries.forEach(([id, vidSegments]) => {
    const vidContainer = vidContainerTemplate.cloneNode(true);
    vidContainer.removeAttribute('id');

    const { upload_date, title } = meta[id];

    // Add video ID and date for chart click navigation and filtering
    vidContainer.setAttribute('data-video-id', id);
    vidContainer.setAttribute('data-upload-date', new Date(upload_date).getTime());

    // Thumbnail
    const thumbLink = qs('.video-thumbnail', vidContainer);
    const thumbImg = qs('.video-thumbnail img', vidContainer);
    thumbLink.setAttribute('href', `https://youtube.com/watch?v=${id}`);
    thumbImg.setAttribute('src', `https://img.youtube.com/vi/${id}/mqdefault.jpg`);
    thumbImg.setAttribute('alt', title);
    thumbImg.onerror = () => { thumbImg.style.display = 'none'; };

    const titleNode = qs('.video-title', vidContainer);
    const uploadNode = qs('.upload-date', vidContainer);
    const mentionNode = qs('.mention-count', vidContainer);
    titleNode.innerText = title;
    titleNode.setAttribute('title', title);
    titleNode.setAttribute('href', `https://youtube.com/watch?v=${id}`);
    uploadNode.innerText = formatDate(upload_date);
    const count = vidSegments.length;
    mentionNode.innerText = `${count} mention${count !== 1 ? 's' : ''}`;

    const segsContainer = qs('.segments-container', vidContainer);
    vidSegments.forEach(segment => {
      const segNode = segmentTemplate.cloneNode(true);
      segNode.removeAttribute('id');
      const aNode = qs('a', segNode);
      const [ startTime, text ] = segment;
      const t = Math.max(0, Number(startTime) - 3);

      aNode.setAttribute('href', `https://youtube.com/watch?v=${id}&t=${t}`);
      // Highlight matching word
      const highlighted = text.replace(
        new RegExp(`(${escapeRegExp(currentWord)})`, 'gi'),
        '<mark>$1</mark>'
      );
      aNode.innerHTML = `${startTime}: ${highlighted}`;
      segsContainer.append(segNode);
    });

    resultsContainer.append(vidContainer);
  });

  requestAnimationFrame(() => {
    resultsContainer.scrollLeft = resultsContainer.scrollWidth;
    updateResultsScroll();
  });

  // Chart - aggregate by video upload date with fixed x-axis range
  if (chart) { chart.destroy(); hoverDateX = null; }

  // Compute global date range from all videos
  const allDates = Object.values(meta).map(m => new Date(m.upload_date).getTime());
  const globalMin = new Date(Math.min(...allDates));
  const globalMax = new Date(Math.max(...allDates));
  // Add a small buffer so edge bars aren't clipped
  globalMin.setDate(globalMin.getDate() - 7);
  globalMax.setDate(globalMax.getDate() + 7);
  chartGlobalMin = globalMin;
  chartGlobalMax = globalMax;

  // Aggregate mentions by upload date
  const chartData = {};
  Object.entries(segments).forEach(([id, vidSegments]) => {
    const { upload_date } = meta[id];
    const date = new Date(upload_date);
    const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!chartData[key]) {
      chartData[key] = { count: 0, date, ids: [] };
    }
    chartData[key].count += vidSegments.length;
    chartData[key].ids.push(id);
  });

  // Build {x, y} data sorted by date
  const sortedEntries = Object.entries(chartData).sort((a, b) => {
    return a[1].date.getTime() - b[1].date.getTime();
  });

  const data = sortedEntries.map(([, { count, date }]) => ({ x: date, y: count }));
  chartVideoIds = sortedEntries.map(([, { ids }]) => ids);

  const colors = getChartColors();
  chart = new Chart(ctx, {
    type: 'bar',
    plugins: [hoverDatePlugin],
    data: {
      datasets: [{
        label: `Mentions of '${word}'`,
        data,
        backgroundColor: colors.bar,
        hoverBackgroundColor: colors.barHover,
        borderRadius: 2,
        borderSkipped: false,
        minBarLength: 4,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: true
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const dataIndex = elements[0].index;
          const videoIds = chartVideoIds[dataIndex];
          if (videoIds && videoIds.length > 0) {
            const firstId = videoIds[0];
            const target = qs(`.video-container[data-video-id="${firstId}"]`);
            if (target) {
              // Scroll the horizontal container to show the card
              const containerRect = resultsContainer.getBoundingClientRect();
              const targetRect = target.getBoundingClientRect();
              const scrollOffset = targetRect.left - containerRect.left - (containerRect.width / 2 - targetRect.width / 2);
              resultsContainer.scrollBy({ left: scrollOffset, behavior: 'smooth' });
              // Also scroll the page to the results area
              qs('#results-wrapper').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              videoIds.forEach(id => {
                const card = qs(`.video-container[data-video-id="${id}"]`);
                if (card) {
                  card.classList.add('highlight');
                  setTimeout(() => card.classList.remove('highlight'), 2500);
                }
              });
            }
          }
        }
      },
      plugins: {
        legend: { display: false },
        zoom: {
          zoom: {
            drag: { enabled: true, backgroundColor: 'rgba(90, 103, 216, 0.15)', borderColor: 'rgba(90, 103, 216, 0.4)', borderWidth: 1 },
            mode: 'x',
            onZoomComplete: () => { updateRangeButtons(); filterVideosByChartRange(); }
          },
          limits: {
            x: { min: globalMin.getTime(), max: globalMax.getTime() }
          }
        },
        tooltip: {
          backgroundColor: colors.tooltip,
          titleFont: { size: 13, weight: '600' },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: (item) => `${item.raw.y} mention${item.raw.y !== 1 ? 's' : ''} — click to jump`
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          min: globalMin,
          max: globalMax,
          time: {
            unit: 'month',
            displayFormats: {
              month: 'MMM yyyy'
            },
            tooltipFormat: 'MMM d, yyyy'
          },
          offset: true,
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            color: colors.text,
            font: { size: 10 },
            callback(value) {
              const d = new Date(value);
              return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
          },
          afterBuildTicks(axis) {
            const min = axis.min;
            const max = axis.max;
            const ticks = [{ value: min }];
            // Add Jan 1 of each year in range
            const startYear = new Date(min).getFullYear() + 1;
            const endYear = new Date(max).getFullYear();
            for (let y = startYear; y <= endYear; y++) {
              const jan1 = new Date(y, 0, 1).getTime();
              if (jan1 > min && jan1 < max) {
                ticks.push({ value: jan1 });
              }
            }
            ticks.push({ value: max });
            axis.ticks = ticks;
          },
          border: { display: true, color: colors.grid }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: colors.grid,
            drawBorder: false
          },
          ticks: {
            color: colors.text,
            font: { size: 11 },
            padding: 8
          },
          afterBuildTicks(axis) {
            const max = axis.max;
            axis.ticks = [{ value: max }];
          },
          border: { display: true, color: colors.grid }
        }
      }
    }
  });

  // Double-click chart to reset zoom
  ctx.addEventListener('dblclick', () => {
    chart.resetZoom();
    setChartRange('all');
  }, true);
}

/* Utils */
function qs (q,r=document) { return r.querySelector(q);    }
function qsa(q,r=document) { return r.querySelectorAll(q); }

function getChartColors() {
  const style = getComputedStyle(document.body);
  const isDark = document.body.classList.contains('dark');
  return {
    bar: isDark ? 'rgba(127, 140, 248, 0.7)' : 'rgba(90, 103, 216, 0.7)',
    barHover: isDark ? 'rgba(127, 140, 248, 0.9)' : 'rgba(90, 103, 216, 0.9)',
    text: style.getPropertyValue('--color-text-muted').trim(),
    grid: isDark ? 'rgba(74, 85, 104, 0.5)' : 'rgba(226, 232, 240, 0.8)',
    legend: style.getPropertyValue('--color-text-muted').trim(),
    tooltip: isDark ? 'rgba(26, 32, 44, 0.95)' : 'rgba(45, 55, 72, 0.95)',
  };
}

const formatter = new Intl.DateTimeFormat(undefined);
function formatDate(date) {
  date = new Date(date);
  return formatter.format(date);
}

function dateToDay(date) {
  date.setHours(0);
  date.setMinutes(0);
  date.setMilliseconds(0);
  return date;
}

function getDays(start, end) {
  dateToDay(start);
  dateToDay(end);
  if (start.getTime() >= end.getTime()) return [];
  const list = [start];
  let nextDay = new Date(start.getTime());

  const ONE_DAY = 24 * 60 * 60 * 1000;
  while ((nextDay.getTime() + ONE_DAY) <= end) {
    nextDay = new Date(nextDay.getTime() + ONE_DAY);
    list.push(nextDay);
  }

  return list;
}

// https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


/* Main */
const input = qs('input');

function doSearch(term) {
  if (!term.trim()) return;
  spinner.classList.add('active');
  qs('#info-message').innerText = '';
  input.value = term;
  sendRequest(term).then(res => {
    handleResponse(res);
  }).catch(err => {
    console.error('Search error:', err);
    spinner.classList.remove('active');
    qs('#info-message').innerText = 'Something went wrong. Please try again.';
  });
}

input.addEventListener('keyup', e => {
  if (e.key === 'Enter' || e.keyCode === 13) {
    setQueryParam(input.value);
    doSearch(input.value);
  }
});

// URL param support
function getQueryParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('q') || '';
}

function setQueryParam(term) {
  const url = new URL(window.location);
  url.searchParams.set('q', term);
  window.history.replaceState(null, '', url);
}

// Fallback suggestions if suggestions.json isn't available
const FALLBACK_SUGGESTIONS = [
  'bazinga', 'minecraft', 'speedrunner', 'fortnite', 'speedrun', 'emoji'
];
const FALLBACK_RANDOM = [
  'unironically', 'speedrunning', 'instagram', 'twitchcon',
  'glitched', 'stardew', 'playthrough', 'subathon',
  'parasocial', 'koopas', 'goated', 'valorant'
];

function renderAllSuggestions(pills, trending, phrases) {
  const container = qs('#suggestions');
  container.innerHTML = '';
  const all = [
    ...(pills || []),
    ...(trending || []),
    ...(phrases || []),
  ];
  // Dedupe
  const unique = [...new Set(all)];
  // Shuffle
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  unique.forEach(w => {
    const btn = document.createElement('button');
    btn.textContent = w;
    btn.addEventListener('click', () => { setQueryParam(w); doSearch(w); });
    container.append(btn);
  });
  requestAnimationFrame(updateSuggestionsScroll);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Load suggestions from generated JSON, fall back to hardcoded
fetch('suggestions.json?v=' + Date.now())
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(data => {
    renderAllSuggestions(data.pills, data.trending, data.phrases);
    initSearch(data.random);
  })
  .catch(() => {
    renderAllSuggestions(FALLBACK_SUGGESTIONS);
    initSearch(FALLBACK_RANDOM);
  });

function initSearch(randomWords) {
  const paramWord = getQueryParam();
  if (!paramWord || paramWord === 'random') {
    doSearch(pickRandom(randomWords));
  } else {
    doSearch(paramWord);
  }
  input.focus();
  input.select();
}

// Theme switcher (system / light / dark)
const themeBtns = qsa('#theme-switcher button');

function updateChartColors() {
  if (!chart) return;
  const colors = getChartColors();
  chart.data.datasets[0].backgroundColor = colors.bar;
  chart.data.datasets[0].hoverBackgroundColor = colors.barHover;
  chart.options.plugins.tooltip.backgroundColor = colors.tooltip;
  chart.options.scales.x.ticks.color = colors.text;
  chart.options.scales.y.ticks.color = colors.text;
  chart.options.scales.y.grid.color = colors.grid;
  chart.update();
}

// Chart time range buttons
const rangeBtns = qsa('#chart-range-buttons button');

function updateRangeButtons() {
  // After a drag-zoom, deactivate "All" and mark none active
  rangeBtns.forEach(b => b.classList.remove('active'));
}

function setChartRange(range) {
  if (!chart || !chartGlobalMax) return;
  rangeBtns.forEach(b => b.classList.toggle('active', b.dataset.range === range));
  if (range === 'all') {
    chart.resetZoom();
    filterVideosByChartRange();
    return;
  }
  const max = new Date(chartGlobalMax);
  const min = new Date(chartGlobalMax);
  if (range === '3m') min.setMonth(min.getMonth() - 3);
  else if (range === '6m') min.setMonth(min.getMonth() - 6);
  else if (range === '1y') min.setFullYear(min.getFullYear() - 1);
  chart.zoomScale('x', { min: min.getTime(), max: max.getTime() });
  filterVideosByChartRange();
}

rangeBtns.forEach(btn => {
  btn.addEventListener('click', () => setChartRange(btn.dataset.range));
});

function applyTheme(mode) {
  localStorage.setItem('theme', mode);
  themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === mode));
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', prefersDark);
  } else {
    document.body.classList.toggle('dark', mode === 'dark');
  }
  updateChartColors();
}
themeBtns.forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') applyTheme('system');
});
applyTheme(localStorage.getItem('theme') || 'system');