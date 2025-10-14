export class TestMetricsReporter {
  public metrics: Record<string, number> = {};
  public timings: Record<string, number[]> = {};

  gauge(name: string, value: number, tags: Record<string, string>) {
    const queue = tags["queue"] ?? "no_queue";
    this.metrics[`${queue},${name}`] = value;
  }

  increment(name: string, tags: Record<string, string>) {
    const queue = tags["queue"] ?? "no_queue";
    const value = this.metrics[`${queue},${name}`] ?? 0;
    this.metrics[`${queue},${name}`] = value + 1;
  }

  metricFor(queue: string, state: string) {
    return this.metrics[`${queue},queue.${state}`];
  }

  timing(name: string, value: number | Date, tags: Record<string, string>) {
    const queue = tags["queue"] ?? "no_queue";
    const key = `${queue},${name}`;

    // eslint-disable-next-line no-multi-assign
    const timingsArray = (this.timings[key] ||= []);

    const reportedValue = value instanceof Date ? Date.now() - value.getTime() : value;

    timingsArray.push(reportedValue);
  }

  timingFor(queue: string, metric: string) {
    return this.timings[`${queue},queue.${metric}`];
  }
}
