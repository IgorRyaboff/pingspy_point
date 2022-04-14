const ping = require('ping').promise;
const axios = require('axios').default;

module.exports = async (proto, url) => {
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
        default:
            return false;
    }
}