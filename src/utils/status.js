const TIME_IN_SECONDS = 1000000000;
const TIME_IN_NANOS = 1000000;
const nunjucks = require('nunjucks');
const moment = require('moment');

const env = nunjucks.configure(`${__dirname}/views`, {
  autoescape: true,
  watch: true,
})

env.addGlobal('moment', moment);


async function getCurrentChecks(influx, waitingTimestamp, startTimestamp, database) {
    let runningChecks = [];
    let failedChecks = [];
    if (database === undefined) {
        runningChecks = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);
        failedChecks = await influx.query(`select * from status where state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);
    } else {
        runningChecks = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`, { database });
        failedChecks = await influx.query(`select * from status where state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`, { database });
    }
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
    return {retries};
  }

  let runningRetries = [];
  if (database === undefined) {
      runningRetries = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingTimestamp}`);
  } else {
      runningRetries = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingTimestamp}`, { database });
  }
  for (let i = 0; i < statusLogsRows.length - 1; i++) {
    if (statusLogsRows[i].step.includes("RETRY")) {
      retries.push({
        duration: ((statusLogsRows[i + 1].time.getNanoTime() - statusLogsRows[i].time.getNanoTime()) / TIME_IN_SECONDS).toFixed(2),
        success: 0,
        fail : 0
      });
    }
  }
    if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
      retries.push({
        duration: (Date.now() * TIME_IN_NANOS - statusLogsRows[statusLogsRows.length - 1].time.getNanoTime()) / TIME_IN_SECONDS,
        success: 0,
        fail : 0
      })
    }
  
  for (let row of runningRetries) {
    if (row.state == 1) {
      retries[row.retry - 1].success++;
      
    } else if(row.state == 2) {
      retries[row.retry - 1].fail++;
    }
  }

  const currentRetries = {
    retries
  };
  return currentRetries;
}

async function makeStatusTables(res, influx, database) {
  const obj = await makeStatusTablesHelper(influx, database);
  return res.send(env.render('status.html', obj ));
}

async function makeStatusTablesHelper(influx, database) {
  const defaultMessage = "Plugin has not started yet.";
  summaryStatus[database] = {success : 0, allUrls : 0, lastRun: '-'};

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
      urlsQuery = await influx.query('select * from nrUrls', {database});
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
  const startTime = statusLogsRows[0].time.toISOString();
  summaryStatus[database].lastRun = startTime.substr(0, 16).replace("T", " ");

  let waitingTimestamp = Date.now() * TIME_IN_NANOS;
  if (statusLogsRows.length >= 2) {
    waitingTimestamp = statusLogsRows[1].time.getNanoTime();
  }

  const currentlyRunningChecksTable = await getCurrentChecks(influx, waitingTimestamp, startTimestamp, database);
  const currentlyRunningRetriesTable = await getCurrentRetries(influx, waitingTimestamp, statusLogsRows.slice(2), database);

  if (statusLogsRows[statusLogsRows.length - 1].step === "START" ||
      statusLogsRows[statusLogsRows.length - 1].step === "WAITING") {

    tablesToShow.first = true;
    return {nrUrls, currentlyRunningChecksTable, tablesToShow, database };
      
  } else if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY") && 
    currentlyRunningRetriesTable.retries !== undefined && currentlyRunningRetriesTable.retries[0].duration !== '0.00') {
    
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
    if (currentlyRunningRetriesTable.retries !== undefined && currentlyRunningRetriesTable.retries[0].duration !== '0.00') {
      tablesToShow.retries = true;
    }
    tablesToShow.finish = true;
    summaryStatus[database].success = countSuccess;
    return {nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, startTime, totalRunningTime, countSuccess, tablesToShow, database };
  }
  return {defaultMessage, database};
}

let summaryStatus = {};
async function getSummaryStatus(influx, metrics) {
  for (let metric of metrics){
    const database = metric.database;
    const resultQuery = await influx.query('SELECT * FROM "status-logs" GROUP BY * ORDER BY "time" DESC LIMIT 1', { database });
    resultQuery.sort((a, b) => {
      return a.time.getNanoTime() - b.time.getNanoTime();
    });
    if (resultQuery[resultQuery.length - 1] !== undefined) {
      if (resultQuery[resultQuery.length - 1].step === "FINISHED") {
        summaryStatus[metric.name] = "FINISHED";
      } else {
        summaryStatus[metric.name] = "IN PROGRESS";
      }
    } else {
      summaryStatus[metric.name] = "No data yet"
    }
    await makeStatusTablesHelper(influx, database);
  }
  return summaryStatus;
}

module.exports = {
  makeStatusTables,
  getSummaryStatus
}