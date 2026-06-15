const Influx = require('influx');
const http = require('http');
let config = {};

function init(db_name, settings){
    config = settings.config;
    // InfluxDB 2.x v1 compatibility API accepts token as the password.
    // If INFLUX_TOKEN is set, use it as password. Username must be non-empty
    // for the v1 compat API (value is ignored, but empty string causes 401).
    // Falls back to INFLUX_USERNAME/INFLUX_PASSWORD for backward compat with 1.x.
    const token = process.env.INFLUX_TOKEN;
    const username = token ? 'token' : (process.env.INFLUX_USERNAME || '');
    const password = token || process.env.INFLUX_PASSWORD || '';
    let influxdb = new Influx.InfluxDB({
        host: process.env.HOST || process.env.INFLUX_HOST || 'localhost',
        port: process.env.INFLUX_PORT || 8086,
        database: db_name,
        username: username,
        password: password,
    });

    influxdb.config = {}
    influxdb.config.database = db_name

    return influxdb
}

const list_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to connect to influx')
    }
}

// Create a bucket via InfluxDB v2 API. Required for InfluxDB 2.x since
// the v1-compat CREATE DATABASE command is not implemented in 2.x.
// Falls back to v1 createDatabase() for backward compat with InfluxDB 1.x.
const _createBucketV2 = (influxdb) => {
    const dbName = influxdb.config.database;
    const org = process.env.INFLUX_ORG || 'garie';
    const token = process.env.INFLUX_TOKEN || process.env.INFLUX_PASSWORD || '';
    const host = process.env.HOST || process.env.INFLUX_HOST || 'localhost';
    const port = process.env.INFLUX_PORT || 8086;

    return new Promise((resolve, reject) => {
        // Step 1: get org ID
        http.get(`http://${host}:${port}/api/v2/orgs?org=${encodeURIComponent(org)}`, {
            headers: { 'Authorization': `Token ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (!parsed.orgs || parsed.orgs.length === 0) {
                        return reject(new Error(`Org '${org}' not found`));
                    }
                    const orgID = parsed.orgs[0].id;

                    // Step 2: create bucket
                    const body = JSON.stringify({
                        name: dbName,
                        orgID: orgID,
                        retentionRules: []
                    });
                    const bucketReq = http.request({
                        hostname: host,
                        port: port,
                        path: '/api/v2/buckets',
                        method: 'POST',
                        headers: {
                            'Authorization': `Token ${token}`,
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(body)
                        }
                    }, (res) => {
                        if (res.statusCode === 201 || res.statusCode === 200) {
                            console.log(`InfluxDB: bucket '${dbName}' created via v2 API`);
                            resolve();
                        } else {
                            reject(new Error(`Bucket creation failed: HTTP ${res.statusCode}`));
                        }
                    });
                    bucketReq.on('error', reject);
                    bucketReq.write(body);
                    bucketReq.end();
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
};

const create_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        if (names.indexOf(influxdb.config.database) === -1) {
            console.log(`InfluxDB: ${influxdb.config.database} database does not exist. Creating database`);
            // Try v2 API first (InfluxDB 2.x), fall back to v1 (InfluxDB 1.x)
            try {
                return await _createBucketV2(influxdb);
            } catch (v2Err) {
                console.log(`InfluxDB: v2 bucket creation failed (${v2Err.message}), trying v1 CREATE DATABASE`);
                return influxdb.createDatabase(influxdb.config.database);
            }
        }
        console.log('InfluxDB', `${influxdb.config.database} database already exists. Skipping creation.`);
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to initialise influx');
    }
}



function tryMultipleTimes(f, reject_msg, option) {
    count = config.resubmit_infux_count_times || 10;
    reject_msg = reject_msg || "Something went wrong when writing into influxdb.";
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const res = await f();
                clearInterval(interval);
                console.log(`At Try Multiple Times success: ${count}, ${option}`);
                resolve(res);
                return;
            } catch (err) {
                count--;
                if (count <= 0) {
                    clearInterval(interval);
                    reject(reject_msg, err);
                    return;
                }
                console.log(`At Try Multiple Times fail: ${count}, ${option}`, interval, err);
            }
        }, (config.resubmit_influx_delay_seconds || 5) * 1000);
    })
}


const saveData = async (influxdb, url, measurement) => {
    try {
//TODO: check why writePoints fails when too many plugins try to write simultaneously to influx
        const result = await tryMultipleTimes( async () => {
                return influxdb.writePoints(measurement);
            },
            `Failed to save ${url} data into ${measurement} at retry.`,
            url
        );
        console.log(`Successfully saved ${influxdb.config.database} data for ${url}`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to save data into influxdb for ${url}`);
    }
}

const savePoints = async (influxdb, points, option) => {
    try {
        const result = await tryMultipleTimes(
            async () => {
                return influxdb.writePoints(points);
            },
            `Failed to mark ${option} into ${points[0].measurement} at retry`,
            option
        );
        console.log(`Successfully saved data for ${option} into ${points[0].measurement}.`);
        return result;
    } catch (err) {
        console.log(`Failed to mark point into ${points[0].measurement}`, err);
        return Promise.reject(`Failed to mark data into influxdb for ${points[0].measurement}`);
    }
}

const markSuccess = (url) => {
    const measurement =  { measurement: 'success',
        tags: { url: url },
        fields: { success: true } };
    return measurement;
}



/*
   state = {0, 1, 2}
   0 -> in process
   1 -> finished successfully
   2 -> failed
*/
const markStatus = (url, state, retry) => {
    const measurement =  {
        measurement: "status",
        tags: { url: url, state: state },
        fields: { retry: retry }
    };

    return measurement;
}


const markStatusLogs = (step, timestamp) => {
    const measurement = {
        measurement: "status-logs",
        tags: {step: step},
        fields: { date: timestamp }
    };
    return measurement;
}


const markAllUrls = (allUrls) => {
    const measurement = {
        measurement: "nrUrls",
        tags: {allUrls : allUrls},
        fields: { date: Date.now() }
    };

    return measurement;
}



module.exports = {
    init,
    list_db,
    create_db,
    saveData,
    markSuccess,
    markStatus,
    markStatusLogs,
    markAllUrls,
    savePoints
}
