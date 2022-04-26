const axios = require('axios').default;
try { require('./etc/config.json'); } catch { console.log('No config file :('); process.exit(255); }
const config = require('./etc/config.json');
const probe = require('./probe');
const Express = require('express');
const ExpressBasicAuth = require('express-basic-auth');

/** @type {Object<string, Monitor>} */
let monitors = {};
/** @type {Object<string, string>} */
let lastMonitorStatus = {};

function addMonitor(id, data) {
    if (monitors[id]) rmMonitor(id);
    monitors[id] = new Monitor(data);
    lastMonitorStatus[id] = data.status;
}
function rmMonitor(id) {
    delete monitors[id];
    delete lastMonitorStatus[id];
}

let reAnnouncing = false;
let isAnnouncing = false;
let lastAnnounce = 0;
async function announce() {
    if (isAnnouncing || reAnnouncing) return;
    lastAnnounce = new Date;
    isAnnouncing = true;
    const reAnnounce = () => {
        setTimeout(() => {
            reAnnouncing = false;
            announce();
        }, 3000);
        reAnnouncing = true;
        isAnnouncing = false;
    }

    for (let i in monitors) lastMonitorStatus[i] = monitors[i].status;

    try {
        resp = await axios({
            url: `${config.server}/announce`,
            method: 'POST',
            responseType: 'json',
            data: JSON.stringify({
                token: config.token,
                data: monitors
            }),
            headers: { 'Content-Type': 'application/json' }
        });
    }
    catch (e) {
        console.log(`Something went wrong, announce request failed with error:`, e);
        return reAnnounce();
    }
    if (resp.status != 200) {
        console.log(`Something went wrong, server responded with HTTP ${resp.status}`);
        return reAnnounce();
    }

    let ans = resp.data;
    if (!ans) {
        console.log(`Something went wrong, server's answer is empty`);
        return reAnnounce();
    }
    if (!ans.ok) {
        console.log(`Something went wrong, server responded with code "${ans.code}"`);
        return reAnnounce();
    }
    if (Array.isArray(ans.remove)) ans.remove.forEach(i => {
        console.log(`Monitor ${i} has been removed by server command`);
        rmMonitor(i);
    });
    if (ans.new) for (let i in ans.new) {
        console.log(`New/updated monitor ${i}, href: ${ans.new[i].href}`);
        addMonitor(i, ans.new[i]);
    };

    isAnnouncing = false;
}

setInterval(() => {
    let haveUpdatedMonitors = false;
    for (let i in monitors) {
        let m = monitors[i];
        if (m.status != lastMonitorStatus[i]) {
            haveUpdatedMonitors = true;
            break;
        }
    }
    if (new Date - lastAnnounce >= 60000 || haveUpdatedMonitors) announce();
}, 1000);

class Monitor {
    #destroyed = false;
    get destroyed() { return this.#destroyed; }
    set destroyed(v) {
        if (v) this.#destroyed = true;
    }

    href = 'ping:0.0.0.0';
    get #hrefProto() {
        return this.href.split(':')[0];
    }
    get #hrefURL() {
        return this.href.split(':').slice(1).join(':');
    }
    status = null;

    constructor(jsonData) {
        this.id = jsonData.id;
        this.href = jsonData.href;
        this.status = jsonData.status;
        this.#probe();
    }

    #isProbing = false;
    async #probe() {
        const end = () => {
            this.#isProbing = false;
            setTimeout(() => this.#probe(), 15000);
        }

        if (this.destroyed) return;
        if (this.#isProbing) return;
        this.#isProbing = true;

        for (let i = 0; i < 3; i++) {
            if (this.destroyed) return;
            let up = await probe(this.#hrefProto, this.#hrefURL);
            if (up) {
                this.status = 'up';
                end();
                return true;
            }
            else await this.#sleep(3000);
        }

        // If we got here, none of 3 probes returned true
        this.status = 'down';
        end();
        return false;
    }

    #sleep(ms) {
        return new Promise(r => {
            setTimeout(() => r(), ms);
        });
    }

    toJSON() {
        return {
            status: this.status,
            href: this.href
        };
    }
}

if (config.expressPort) {
    const server = Express();
    server.set('view engine', 'ejs');
    if (config.expressAuth) server.use(ExpressBasicAuth({ users: config.expressAuth }));
    server.get('/monitors', (_req, resp) => {
        let result = [];
        for (let i in lastMonitorStatus) result.push(`${monitors[i].status == 'up' ? '🟢' : '🔴'} ${i} (${monitors[i].href.replace(/\</g, '&lt;').replace(/\>/g, '&lt;')})`);
        resp.render('info', {
            monitors: monitors,
            lastAnnounce: lastAnnounce
        });
    });
    server.listen(config.expressPort);
}