links = Array.from(document.querySelectorAll('ytd-rich-grid-row a[href^="/watch"]')).map(a => a.getAttribute('href'));
links = Array.from(new Set(links));
