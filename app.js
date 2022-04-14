const axios = require('axios').default;
try { require('./etc/config.json'); } catch { console.log('No config file :('); process.exit(255); }
const config = require('./etc/config.json');
const probe = require('./probe');

let monitors = {};

async function cycle() {
    let requestData = {};
    let promises = [];
    for (let i in monitors) {
        let proto = monitors[i].split(':')[0];
        let url = monitors[i].split(':').slice(1);
        promises.push(probe(proto, url).then(r => {
            requestData[i] = {
                status: r ? 'up' : 'down',
                href: monitors[i]
            };
        }));
    }
    await Promise.all(promises);

    /** @type {Fetch.Response} */
    let resp;
    try {
        resp = await axios({
            url: `${config.server}/announce`,
            method: 'POST',
            responseType: 'json',
            data: JSON.stringify({
                token: config.token,
                data: requestData
            }),
            headers: { 'Content-Type': 'application/json' }
        });
    }
    catch (e) {
        console.log(`Something went wrong, announce request failed with error:`, e);
        return scheduleCycle();
    }
    if (resp.status != 200) {
        console.log(`Something went wrong, server responded with HTTP ${resp.status}`);
        return scheduleCycle();
    }

    let ans = resp.data;
    if (!ans) {
        console.log(`Something went wrong, server's answer is empty`);
        return scheduleCycle();
    }
    if (!ans.ok) {
        console.log(`Something went wrong, server responded with code "${ans.code}"`);
        return scheduleCycle();
    }
    if (Array.isArray(ans.remove)) ans.remove.forEach(i => {
        console.log(`Monitor ${i} has been removed by server command`);
        delete monitors[i];
    });
    if (ans.new) for (let i in ans.new) {
        console.log(`New/updated monitor ${i}, href: ${ans.new[i]}`);
        monitors[i] = ans.new[i];
    };
    //console.log('Cycle successfully complete');
    scheduleCycle();
}

function scheduleCycle() {
    setTimeout(() => cycle(), 1000 * 60 * 60);
}

cycle();