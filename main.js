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
let chart;
function handleResponse(res) {
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

  // Sort segments
  const segmentEntries = Object.entries(segments);
  segmentEntries.sort((a, b) => {
    const aDate = new Date(meta[a[0]].upload_date);
    const bDate = new Date(meta[b[0]].upload_date);
    return aDate.getTime() < bDate.getTime();
  });

  segmentEntries.forEach(([id, vidSegments]) => {
    const vidContainer = vidContainerTemplate.cloneNode(true);
    vidContainer.removeAttribute('id');

    const { upload_date, title } = meta[id];
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
      aNode.innerText = `${startTime}: ${text}`;
      segsContainer.append(segNode);
    });

    resultsContainer.append(vidContainer);
  });



  // Chart.
  if (chart) chart.destroy();
  const start = new Date(
                  Math.min(
                    ...Object.values(meta).
                      map(({ upload_date }) => new Date(upload_date).getTime())
                  )
                );
  const end = new Date(
                Math.max(
                  ...Object.values(meta).
                    map(({ upload_date }) => new Date(upload_date).getTime())
                )
              );
  const days = getDays(start, end).map(date => formatter.format(date));

  let data = new Array(days.length).fill(0);
  const range = (end.getTime() - start.getTime());
  const numDays = days.length;
  Object.entries(segments).forEach(([id, vidSegments]) => {
    const { upload_date } = meta[id];
    const day = dateToDay(new Date(upload_date));
    const bin = 1 + Math.ceil(numDays * (day.getTime() - start.getTime()) / range);

    data[bin] += vidSegments.length;
  });

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: `Mentions of '${word}'`,
        data,
        borderWidth: 1,
        barThickness: 1,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
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
input.addEventListener('keyup', e => {
  if (e.key === 'Enter' || e.keyCode === 13) {
    sendRequest(input.value).then(res => {
      handleResponse(res);
    });
  }
});

input.focus();