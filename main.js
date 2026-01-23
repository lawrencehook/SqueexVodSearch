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
  const params = {};
  const url = HOST + '/' + word;
  const request = sendHTTPRequest('GET', url, params);
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
    titleNode.innerText = title;
    titleNode.setAttribute('title', title);
    titleNode.setAttribute('href', `https://youtube.com/watch?v=${id}`);
    uploadNode.innerText = formatDate(upload_date);

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



  // Chart - aggregate by video upload date (only days with data)
  if (chart) chart.destroy();

  const chartData = {};
  const chartVideoMap = {}; // date -> [video IDs]
  Object.entries(segments).forEach(([id, vidSegments]) => {
    const { upload_date } = meta[id];
    const timestamp = new Date(upload_date).getTime();
    // Use timestamp as key to avoid date formatting issues
    if (!chartData[timestamp]) {
      chartData[timestamp] = { count: 0, date: upload_date, ids: [] };
    }
    chartData[timestamp].count += vidSegments.length;
    chartData[timestamp].ids.push(id);
  });

  // Sort by timestamp (oldest first for chart)
  const sortedEntries = Object.entries(chartData).sort((a, b) => {
    return Number(a[0]) - Number(b[0]);
  });

  chartDays = sortedEntries.map(([, { date }]) => formatter.format(new Date(date)));
  const data = sortedEntries.map(([, { count }]) => count);
  chartVideoIds = sortedEntries.map(([, { ids }]) => ids);

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartDays,
      datasets: [{
        label: `Mentions of '${word}'`,
        data,
        backgroundColor: 'rgba(90, 103, 216, 0.7)',
        hoverBackgroundColor: 'rgba(90, 103, 216, 0.9)',
        borderRadius: 2,
        borderSkipped: false,
        barThickness: 'flex',
        minBarLength: 4,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
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
                  setTimeout(() => card.classList.remove('highlight'), 1500);
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
            color: '#4a5568'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(45, 55, 72, 0.95)',
          titleFont: { size: 13, weight: '600' },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => `${item.raw} mention${item.raw !== 1 ? 's' : ''} — click to jump`
          }
        }
      },
      scales: {
        x: {
          offset: true,
          grid: { display: false },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
            color: '#718096',
            font: { size: 11 }
          },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(226, 232, 240, 0.8)',
            drawBorder: false
          },
          ticks: {
            color: '#718096',
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
  input.value = term;
  sendRequest(term).then(res => {
    handleResponse(res);
  });
}

input.addEventListener('keyup', e => {
  if (e.key === 'Enter' || e.keyCode === 13) {
    doSearch(input.value);
  }
});

// Suggestion buttons
qsa('#suggestions button').forEach(btn => {
  btn.addEventListener('click', () => {
    doSearch(btn.textContent);
  });
});

// Random word on page load
const randomWords = [
  'youtube', 'twitch', 'gaming', 'stream', 'chat', 'funny',
  'coffee', 'music', 'movie', 'pizza', 'sleep', 'water',
  'friend', 'money', 'crazy', 'actually', 'literally', 'basically'
];
const randomWord = randomWords[Math.floor(Math.random() * randomWords.length)];
doSearch(randomWord);

input.focus();
input.select();