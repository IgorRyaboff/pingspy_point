const ping = require('ping').promise;
const axios = require('axios').default;
const fs = require('fs');
const ChildProcess = require('child_process');

module.exports = async (proto, url) => {
    //console.log('doing ', proto, url);
    switch (proto) {
        case 'ping':
            for (let i = 0; i < 3; i++) {
                if ((await ping.probe(url, { timeout: 3 })).alive) return true;
            }
            return false;
        case 'http':
            try {
                let resp = await axios({ url: 'http://' + url });
                return resp.status >= 200 && resp.status < 300;
            }
            catch {
                return false;
            }
        case 'https':
            try {
                let resp = await axios({ url: 'https://' + url });
                return resp.status >= 200 && resp.status < 300;
            }
            catch {
                return false;
            }
        case 'port':
            const regexIp = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
            const regexDomain = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
            let host = url.split(':')[0];
            let port = url.split(':')[1];
            if (!regexIp.test(host) && !regexDomain.test(host)) return false;
            if (isNaN(port) || port % 1 != 0 || port < 1 || port > 65535) return false;

            return await new Promise(r => {
                ChildProcess.exec(`nmap ${host} -p ${port}`, (_, stdout) => {
                    let found = false;
                    stdout.split('\n').forEach(l => {
                        if (l.startsWith(`${port}/tcp `)) {
                            const portState = l.replace(/ {2,100}/g, ' ').split(' ')[1];
                            r(portState == 'open');
                            found = true;
                        }
                    });
                    if (!found) r(false);
                });
            });
        default:
            return false;
    }
}