const {
    monitorEventLoopDelay
} = require("node:perf_hooks");


function convertMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
}


function collectMemoryMetrics() {

    const memory = process.memoryUsage();

    console.log({
        rss: convertMB(memory.rss),
        heapTotal: convertMB(memory.heapTotal),
        heapUsed: convertMB(memory.heapUsed),
        external: convertMB(memory.external),
        arrayBuffers: convertMB(memory.arrayBuffers)
    });

}


// ----------------------
// CPU
// ----------------------

let previousCPU = process.cpuUsage();
let previousTime = process.hrtime.bigint();


function collectCPUUsage() {

    const currentCPU = process.cpuUsage();
    const currentTime = process.hrtime.bigint();

    const userCPU =currentCPU.user - previousCPU.user;

    const systemCPU =currentCPU.system - previousCPU.system;

    const totalCPU =userCPU + systemCPU;

    const elapsedTime =Number(currentTime - previousTime) / 1000;

    const cpuUsage =(totalCPU / elapsedTime) * 100;

    console.log({
        userCPU,
        systemCPU,
        cpuUsage: `${cpuUsage.toFixed(2)}%`
    });

    previousCPU = currentCPU;
    previousTime = currentTime;
}


// ----------------------
// Event Loop
// ----------------------

const eventLoopHistogram =
    monitorEventLoopDelay({
        resolution: 20
    });

eventLoopHistogram.enable();


function nsToMs(ns) {
    return ns / 1e6;
}


function collectEventLoopMetrics() {

    console.log({
        min: nsToMs(eventLoopHistogram.min),
        max: nsToMs(eventLoopHistogram.max),
        mean: nsToMs(eventLoopHistogram.mean),
        p50: nsToMs(eventLoopHistogram.percentile(50)),
        p95: nsToMs(eventLoopHistogram.percentile(95)),
        p99: nsToMs(eventLoopHistogram.percentile(99))
    });

}


// ----------------------
// Collector
// ----------------------

setInterval(() => {

    console.log("\n===== RUNTIME METRICS =====");

    collectMemoryMetrics();
    collectCPUUsage();
    collectEventLoopMetrics();

}, 10000);