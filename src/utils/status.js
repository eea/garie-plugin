const TIME_IN_SECONDS = 1000000000;
const TIME_IN_NANOS = 1000000;
const nunjucks = require('nunjucks');
const moment = require('moment');
const { checkTcpPort } = require('./helpers');

const env = nunjucks.configure(`${__dirname}/views`, {
  autoescape: true,
  watch: false,
})

env.addGlobal('moment', moment);
env.addGlobal('Date', Date);

async function getCurrentChecks(influx, waitingTimestamp, startTimestamp, database) {
  let runningChecks = [];

  const queryChecks = `select * from status where (state=\'1\' or state=\'2\') and time>=${startTimestamp} and retry=0`;
  if (database === undefined) {
    runningChecks = await influx.query(queryChecks);
  } else {
    runningChecks = await influx.query(queryChecks, { database });
  }
  const failedChecks = runningChecks.filter((elem) => elem.state === '2');
  const duration = (waitingTimestamp - startTimestamp) / TIME_IN_SECONDS;

  const currentChecks = {
    runningChecks: runningChecks.length,
    failedChecks: failedChecks.length,
    startTime: startTimestamp,
    duration: duration.toFixed(2)
  }
  return currentChecks;
}


async function getCurrentRetries(influx, waitingTimestamp, statusLogsRows, database) {
  const retries = [];
  if (statusLogsRows.length === 0) {
    return { retries };
  }

  let runningRetries = [];
  if (database === undefined) {
    runningRetries = await influx.query(`select * from status where (state=\'1\' or state=\'2\') and time > ${waitingTimestamp}`);
  } else {
    runningRetries = await influx.query(`select * from status where (state=\'1\' or state=\'2\') and time > ${waitingTimestamp}`, { database });
  }
  for (let i = 0; i < statusLogsRows.length - 1; i++) {
    if (statusLogsRows[i].step.includes("RETRY")) {
      retries.push({
        duration: ((statusLogsRows[i + 1].time.getNanoTime() - statusLogsRows[i].time.getNanoTime()) / TIME_IN_SECONDS).toFixed(2),
        success: 0,
        fail: 0,
        failedUrls: new Set()
      });
    }
  }

  if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
    retries.push({
      duration: (Date.now() * TIME_IN_NANOS - statusLogsRows[statusLogsRows.length - 1].time.getNanoTime()) / TIME_IN_SECONDS,
      success: 0,
      fail: 0,
      failedUrls: new Set()
    })
  }

  for (let row of runningRetries) {
    if (row.state == 1 && row.retry != 0) {
      if (retries[row.retry - 1] === undefined) {
        console.log(`Can't mark success at retry nr ${row.retry} in retries of length: ${retries.length}.`);
        continue;
      }
      if (retries[row.retry - 1].success === undefined) {
        retries[row.retry - 1].success = 1;
      } else {
        retries[row.retry - 1].success++;
      }

    } else if (row.state == 2 && row.retry != 0) {
      if (retries[row.retry - 1] === undefined) {
        console.log(`Can't mark fail at retry nr ${row.retry} in retries of length: ${retries.length}.`);
        continue;
      }
      if (retries[row.retry - 1].fail === undefined) {
        retries[row.retry - 1].fail = 1;
      } else {
        retries[row.retry - 1].fail++;
      }
      if (row.retry == 3) {
        retries[row.retry - 1].failedUrls.add(row.url);
      }
    }


  }
  const currentRetries = {
    retries
  };
  return currentRetries;
}

async function makeStatusTables(res, influx, database) {
  let obj = {};
  try {
    obj = await makeStatusTablesHelper(influx, database);
  } catch (err) {
    console.log('Something wrong happened while trying to get data for status', err);
  }
  const timez = process.env.TZ;
  obj.timez = timez;
  return res.send(env.render('status.html', obj));
}

async function makeStatusTablesHelper(influx, database) {
  const defaultMessage = "Plugin has not started yet.";
  summaryStatus[database] = { success: 0, allUrls: 0, lastRun: '-' };

  let tablesToShow = {
    first: false,
    retries: false,
    finish: false
  };

  let statusLogsQuery = [];
  let urlsQuery = [];

  if (database === undefined) {
    statusLogsQuery = await influx.query('select last(*) from "status-logs" group by step order by time asc');
    urlsQuery = await influx.query('select * from nrUrls');
  } else {
    statusLogsQuery = await influx.query('select last(*) from "status-logs" group by step order by time asc', { database });
    urlsQuery = await influx.query('select * from nrUrls', { database });
  }

  if (urlsQuery.length > 0) {
    summaryStatus[database].allUrls = urlsQuery[urlsQuery.length - 1].allUrls;
  }
  const nrUrls = summaryStatus[database].allUrls;

  if (statusLogsQuery.length === 0) {
    return { defaultMessage, database };
  }
  statusLogsQuery.sort((a, b) => {
    return a.time.getNanoTime() - b.time.getNanoTime();
  });

  const idx = statusLogsQuery.findIndex(elem => elem.step === "START");
  const statusLogsRows = statusLogsQuery.slice(idx);
  const startTimestamp = statusLogsRows[0].time.getNanoTime();
  const startTime = new Date(startTimestamp / TIME_IN_NANOS).toLocaleString({ timeZone: process.env.TZ });
  summaryStatus[database].lastRun = startTime;

  let waitingTimestamp = Date.now() * TIME_IN_NANOS;
  if (statusLogsRows.length >= 2) {
    waitingTimestamp = statusLogsRows[1].time.getNanoTime();
  }

  const currentlyRunningChecksTable = await getCurrentChecks(influx, waitingTimestamp, startTimestamp, database);
  const currentlyRunningRetriesTable = await getCurrentRetries(influx, waitingTimestamp, statusLogsRows.slice(2), database);

  if (statusLogsRows[statusLogsRows.length - 1].step === "START" ||
    statusLogsRows[statusLogsRows.length - 1].step === "WAITING") {

    tablesToShow.first = true;
    return { nrUrls, currentlyRunningChecksTable, tablesToShow, database };

  } else if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY") &&
    currentlyRunningRetriesTable.retries.length > 0 && currentlyRunningRetriesTable.retries[0].duration !== '0.00') {

    tablesToShow.first = true;
    tablesToShow.retries = true;
    return { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, tablesToShow, database };

  } else if (statusLogsRows[statusLogsRows.length - 1].step === "FINISHED") {

    const finishTime = statusLogsRows[statusLogsRows.length - 1].time.getNanoTime();
    const totalRunningTime = ((finishTime - startTimestamp) / TIME_IN_SECONDS).toFixed(2);


    let successful = [];
    if (database === undefined) {
      successful = await influx.query(`select * from success where time>=${startTimestamp} and time<=${finishTime}`);
    } else {
      successful = await influx.query(`select * from success where time>=${startTimestamp} and time<=${finishTime}`, { database });
    }

    const countSuccess = successful.length;
    summaryStatus[database].success = countSuccess;

    tablesToShow.first = true;
    if (currentlyRunningRetriesTable.retries.length > 0 && currentlyRunningRetriesTable.retries[0].duration !== '0.00') {
      tablesToShow.retries = true;
    }
    tablesToShow.finish = true;
    summaryStatus[database].success = countSuccess;

    if (!currentlyRunningRetriesTable || !currentlyRunningRetriesTable.retries || !currentlyRunningRetriesTable.retries.length
      || currentlyRunningRetriesTable.retries[currentlyRunningRetriesTable.retries.length - 1].failedUrls.size != nrUrls - countSuccess) {
      const defaultMessage = `Plugin ${database} might have some failures. Please rerun it.`;
      return { defaultMessage, nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, startTime, totalRunningTime, countSuccess, tablesToShow, database };
    }

    return { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, startTime, totalRunningTime, countSuccess, tablesToShow, database };
  }
  return { defaultMessage, database };
}

let summaryStatus = {};
async function getSummaryStatus(influx, metrics) {

  for (let metric of metrics) {

    if (summaryStatus[metric.name] === undefined) {
      summaryStatus[metric.name] = {};
    }

    const database = metric.database;
    const resultQuery = await influx.query('SELECT * FROM "status-logs" GROUP BY * ORDER BY "time" DESC LIMIT 1', { database });
    resultQuery.sort((a, b) => {
      return a.time.getNanoTime() - b.time.getNanoTime();
    });
    if (resultQuery[resultQuery.length - 1] !== undefined) {
      if (resultQuery[resultQuery.length - 1].step === "FINISHED") {
        const finishTime = resultQuery[resultQuery.length - 1].time.getNanoTime();
        let i = 1;
        let startTime = 0;
        while (resultQuery.length >= i && resultQuery[resultQuery.length - i].step !== "START") {
          i++;
        }
        if (resultQuery[resultQuery.length - i].step === "START") {
          startTime = resultQuery[resultQuery.length - i].time.getNanoTime();
        }
        summaryStatus[metric.name].status = "FINISHED";
        summaryStatus[metric.name].duration = ((finishTime - startTime) / TIME_IN_SECONDS).toFixed(0);
      } else {
        summaryStatus[metric.name].status = "IN PROGRESS";
      }
    } else {
      summaryStatus[metric.name].status = "No data yet"
    }
    try {
      await makeStatusTablesHelper(influx, database);
    } catch (err) {
      console.log('Something wrong happened while trying to get data for status', err);
    }

    summaryStatus[metric.name].alive = 'unknown';
    let host = "garie-";
    //codeage database names differs from the service name
    if (metric.database === "code-age") {
      host += "codeage";
    } else {
      host += metric.database;
    }
    const alive = await checkTcpPort(host);

    if (alive.alive === false) {
      summaryStatus[metric.name].alive = 'DOWN';
    } else {
      summaryStatus[metric.name].alive = 'UP';
    }

  }
  return summaryStatus;
}

module.exports = {
  makeStatusTables,
  getSummaryStatus
}