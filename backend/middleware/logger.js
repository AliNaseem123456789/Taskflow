export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const workerId = process.env.NODE_APP_INSTANCE ?? "n/a";

  res.on("finish", () => {
    const finish = process.hrtime.bigint();
    const time = Number(finish - start) / 1e6;
    console.log(
      `[worker ${workerId} | pid ${process.pid}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${time.toFixed(2)}ms)`
    );
  });

  next();
};