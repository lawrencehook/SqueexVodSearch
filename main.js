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
let chart;
let currentWord = '';
let chartDays = [];
let chartVideoIds = []; // Maps bar index to array of video IDs for that date

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
    let info = `No results for "${qs('input').value}".\n`;
    info += `Common words and swears (decided by YT) are excluded. `;
    info += `Queries can only contain dictionary words (try squeaks instead of squeex). `;
    qs('#info-message').innerText = info;
    return;
  }

  currentWord = word;

  // Show when data was last updated
  const totalMentions = Object.values(segments).reduce((acc, vidSegments) => {
    return acc + vidSegments.reduce((acc, [time, text]) => {
      return acc + (text.match(new RegExp(escapeRegExp(word), 'ig')) || []).length;
    }, 0)
  }, 0);
  const info = `Squeex has said '${word}' ${totalMentions} times. ` + 
               `Last updated: ${formatDate(updatedAt)}.`;
  qs('#info-message').innerText = info;

  // Empty out the results container.
  Array.from(resultsContainer.childNodes).forEach(n => {
    if (n.id === 'template-video-container') return;
    n.remove();
  })

  // Sort segments by date (most recent first)
  const segmentEntries = Object.entries(segments);
  segmentEntries.sort((a, b) => {
    const aDate = new Date(meta[a[0]].upload_date);
    const bDate = new Date(meta[b[0]].upload_date);
    return bDate.getTime() - aDate.getTime();
  });

  segmentEntries.forEach(([id, vidSegments]) => {
    const vidContainer = vidContainerTemplate.cloneNode(true);
    vidContainer.removeAttribute('id');

    const { upload_date, title } = meta[id];

    // Add video ID for chart click navigation
    vidContainer.setAttribute('data-video-id', id);

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



  // Chart - aggregate by video upload date with fixed x-axis range
  if (chart) chart.destroy();

  // Compute global date range from all videos
  const allDates = Object.values(meta).map(m => new Date(m.upload_date).getTime());
  const globalMin = new Date(Math.min(...allDates));
  const globalMax = new Date(Math.max(...allDates));
  // Add a small buffer so edge bars aren't clipped
  globalMin.setDate(globalMin.getDate() - 7);
  globalMax.setDate(globalMax.getDate() + 7);

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
      maintainAspectRatio: true,
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
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        legend: {
          display: true,
          labels: {
            boxWidth: 12,
            padding: 16,
            font: { size: 13 },
            color: colors.legend
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
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
            color: colors.text,
            font: { size: 11 }
          },
          border: { display: false }
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
          border: { display: false }
        }
      }
    }
  });
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
  }).catch(() => {
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

function buildRow(label, words, btnClass) {
  const row = document.createElement('div');
  row.className = 'suggestion-row';
  const lbl = document.createElement('span');
  lbl.className = 'suggestion-label';
  lbl.textContent = label;
  row.append(lbl);
  words.forEach(w => {
    const btn = document.createElement('button');
    if (btnClass) btn.className = btnClass;
    btn.textContent = w;
    btn.addEventListener('click', () => { setQueryParam(w); doSearch(w); });
    row.append(btn);
  });
  return row;
}

function renderAllSuggestions(pills, trending, phrases) {
  const container = qs('#suggestions');
  container.innerHTML = '';
  if (pills && pills.length) container.append(buildRow('try', pills.slice(0, 6)));
  if (trending && trending.length) container.append(buildRow('trending', trending.slice(0, 8), 'trending'));
  if (phrases && phrases.length) container.append(buildRow('phrases', phrases.slice(0, 6), 'phrase'));
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
  chart.options.plugins.legend.labels.color = colors.legend;
  chart.options.plugins.tooltip.backgroundColor = colors.tooltip;
  chart.options.scales.x.ticks.color = colors.text;
  chart.options.scales.y.ticks.color = colors.text;
  chart.options.scales.y.grid.color = colors.grid;
  chart.update();
}

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