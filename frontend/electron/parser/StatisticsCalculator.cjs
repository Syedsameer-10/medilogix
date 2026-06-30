function calculateStatistics(samples) {
  if (samples.length === 0) {
    throw new Error('No pressure readings found');
  }

  const values = samples.map((sample) => sample.psi);
  const peakPsi = Math.max(...values);
  const minimumPsi = Math.min(...values);
  const averagePsi = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    averagePsi: Number(averagePsi.toFixed(2)),
    minimumPsi,
    peakPsi,
    sampleCount: samples.length,
    testDuration: samples.length > 1 ? `${samples[0].timestamp} - ${samples[samples.length - 1].timestamp}` : samples[0].timestamp,
  };
}

module.exports = { calculateStatistics };
