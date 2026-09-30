import os from "node:os";
import {
    PerformanceObserver,
    monitorEventLoopDelay,
    performance
} from "node:perf_hooks";


// ============================================================
// Helpers
// ============================================================

function convertMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}

function nsToMs(ns) {
    return ns / 1e6;
}


// ============================================================
// MEMORY — Node Process
// ============================================================

function collectMemoryMetrics() {

    const memory = process.memoryUsage();

    console.log({
        rss: `${convertMB(memory.rss)} MB`,
        heapTotal: `${convertMB(memory.heapTotal)} MB`,
        heapUsed: `${convertMB(memory.heapUsed)} MB`,
        external: `${convertMB(memory.external)} MB`,
        arrayBuffers: `${convertMB(memory.arrayBuffers)} MB`
    });
}


// ============================================================
// CPU — Node Process
// ============================================================

let previousCPU = process.cpuUsage();
let previousTime = process.hrtime.bigint();

function collectCPUUsage() {

    const currentCPU = process.cpuUsage();
    const currentTime = process.hrtime.bigint();

    const userCPU =currentCPU.user - previousCPU.user;

    const systemCPU =currentCPU.system - previousCPU.system;

    const totalCPU =userCPU + systemCPU;

    // hrtime = nanoseconds
    // cpuUsage = microseconds
    // Convert nanoseconds → microseconds
    const elapsedTime =Number(currentTime - previousTime) / 1000;

    const cpuUsage =(totalCPU / elapsedTime) * 100;

    console.log({
        userCPU: `${userCPU} μs`,
        systemCPU: `${systemCPU} μs`,
        cpuUsage: `${cpuUsage.toFixed(2)}%`
    });

    previousCPU = currentCPU;
    previousTime = currentTime;
}


// ============================================================
// EVENT LOOP DELAY
// ============================================================

const eventLoopHistogram =
    monitorEventLoopDelay({
        resolution: 20
    });

eventLoopHistogram.enable();

function collectEventLoopMetrics() {

    console.log({
        min: `${nsToMs(eventLoopHistogram.min).toFixed(2)} ms`,

        max: `${nsToMs(eventLoopHistogram.max).toFixed(2)} ms`,

        mean: `${nsToMs(eventLoopHistogram.mean).toFixed(2)} ms`,

        p50: `${nsToMs(
            eventLoopHistogram.percentile(50)
        ).toFixed(2)} ms`,

        p95: `${nsToMs(
            eventLoopHistogram.percentile(95)
        ).toFixed(2)} ms`,

        p99: `${nsToMs(
            eventLoopHistogram.percentile(99)
        ).toFixed(2)} ms`
    });

    // Reset so the next measurement represents
    // the next interval instead of the entire process lifetime.
    eventLoopHistogram.reset();
}
// EVENT LOOP UTILIZATION
let previousELU =performance.eventLoopUtilization();

function collectEventLoopUtilization() {

    const currentELU =performance.eventLoopUtilization(previousELU);

    console.log({
        utilization:
            `${(currentELU.utilization * 100).toFixed(2)}%`,

        active:
            `${currentELU.active.toFixed(2)} ms`,

        idle:
            `${currentELU.idle.toFixed(2)} ms`
    });

    previousELU = currentELU;
}
// GARBAGE COLLECTION

let gcCount = 0;
let totalGCDuration = 0;
let maxGCDuration = 0;

const gcObserver = new PerformanceObserver((list) => {

    for (const entry of list.getEntries()) {

        gcCount++;

        totalGCDuration += entry.duration;

        maxGCDuration =
            Math.max(maxGCDuration, entry.duration);
    }
});

gcObserver.observe({
    entryTypes: ["gc"]
});


function collectGCMetrics() {

    console.log({
        gcCount,
        totalGCDuration:`${totalGCDuration.toFixed(2)} ms`,

        maxGCDuration:`${maxGCDuration.toFixed(2)} ms`
    });

    // Reset interval counters
    gcCount = 0;
    totalGCDuration = 0;
    maxGCDuration = 0;
}

// PROCESS

function collectProcessMetrics() {

    console.log({
        pid: process.pid,
        ppid: process.ppid,
        uptime:
            `${process.uptime().toFixed(2)} seconds`
    });
}

// HOST MEMORY

function collectHostMemoryMetrics() {

    const total = os.totalmem();
    const free = os.freemem();

    const used = total - free;

    const utilization =(used / total) * 100;

    console.log({
        totalMemory:
            `${convertMB(total)} MB`,

        freeMemory:
            `${convertMB(free)} MB`,

        usedMemory:
            `${convertMB(used)} MB`,

        utilization:
            `${utilization.toFixed(2)}%`
    });
}

// HOST CPU

function getHostCPUStats() {

    const cpus = os.cpus();

    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {

        idle += cpu.times.idle;

        total +=
            cpu.times.user +
            cpu.times.nice +
            cpu.times.sys +
            cpu.times.idle +
            cpu.times.irq;
    }

    return {
        idle,
        total
    };
}

let previousHostCPU = getHostCPUStats();


function collectHostCPU() {

    const currentHostCPU =
        getHostCPUStats();

    const idleDelta =
        currentHostCPU.idle -
        previousHostCPU.idle;

    const totalDelta =
        currentHostCPU.total -
        previousHostCPU.total;

    const utilization =
        ((totalDelta - idleDelta) /
            totalDelta) * 100;

    console.log({
        cpuCores: os.cpus().length,

        cpuUtilization:
            `${utilization.toFixed(2)}%`
    });

    previousHostCPU = currentHostCPU;
}


// ============================================================
// LOAD AVERAGE
// ============================================================

function collectLoadAverage() {

    const [
        oneMinute,
        fiveMinutes,
        fifteenMinutes
    ] = os.loadavg();

    console.log({
        oneMinute: oneMinute.toFixed(2),
        fiveMinutes: fiveMinutes.toFixed(2),
        fifteenMinutes: fifteenMinutes.toFixed(2)
    });
}


// ============================================================
// MAIN RUNTIME COLLECTOR
// ============================================================

setInterval(() => {

    console.log(
        "\n=============================="
    );

    console.log(
        "      NODE RUNTIME METRICS"
    );

    console.log(
        "=============================="
    );


    console.log("\n--- Process Memory ---");
    collectMemoryMetrics();


    console.log("\n--- Process CPU ---");
    collectCPUUsage();


    console.log("\n--- Event Loop Delay ---");
    collectEventLoopMetrics();


    console.log("\n--- Event Loop Utilization ---");
    collectEventLoopUtilization();


    console.log("\n--- Garbage Collection ---");
    collectGCMetrics();


    console.log("\n--- Process ---");
    collectProcessMetrics();


    console.log("\n--- Host Memory ---");
    collectHostMemoryMetrics();


    console.log("\n--- Host CPU ---");
    collectHostCPU();


    console.log("\n--- Load Average ---");
    collectLoadAverage();

}, 10_000);