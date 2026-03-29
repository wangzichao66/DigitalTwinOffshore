import http from 'http';
import fs from 'fs';
http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
        if (body) {
            if (req.url === '/dom') {
                fs.writeFileSync('browser_dom.html', body);
                console.log('Saved DOM.');
                process.exit(0);
            } else {
                fs.appendFileSync('browser_error.txt', body + '\n---\n');
            }
        }
        res.end('ok');
    });
}).listen(8080, () => console.log('Listening on 8080'));
