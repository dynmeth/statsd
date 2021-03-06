var process_metrics = function (metrics, flushInterval, ts, flushCallback) {
    var starttime = Date.now();
    var key;
    var counter_rates = {};
    var timer_data = {};
    var statsd_metrics = {};
    var counters = metrics.counters;
    var timers = metrics.timers;
    var timer_counters = metrics.timer_counters;
    var pctThreshold = metrics.pctThreshold;
    var histogram = metrics.histogram;

    for (key in counters) {
      var value = counters[key];

      // calculate "per second" rate
      counter_rates[key] = value / (flushInterval / 1000);
    }

    for (key in timers) {
      if (timers[key].length > 0) {
        timer_data[key] = {};
        var current_timer_data = {};

        var values = timers[key].sort(function (a,b) { return a-b; });
        var count = values.length;
        var min = values[0];
        var max = values[count - 1];

        var cumulativeValues = [min];
        for (var i = 1; i < count; i++) {
            cumulativeValues.push(values[i] + cumulativeValues[i-1]);
        }

        var sum = min;
        var mean = min;
        var maxAtThreshold = max;

        var key2;

        for (key2 in pctThreshold) {
          var pct = pctThreshold[key2];
          if (count > 1) {
            var numInThreshold = Math.round(pct / 100 * count);

            maxAtThreshold = values[numInThreshold - 1];
            sum = cumulativeValues[numInThreshold - 1];
            mean = sum / numInThreshold;
          }

          var clean_pct = '' + pct;
          clean_pct = clean_pct.replace('.', '_');
          current_timer_data["mean_" + clean_pct] = mean;
          current_timer_data["upper_" + clean_pct] = maxAtThreshold;
          current_timer_data["sum_" + clean_pct] = sum;

        }

        sum = cumulativeValues[count-1];
        mean = sum / count;

        var sumOfDiffs = 0;
        for (var i = 0; i < count; i++) {
           sumOfDiffs += (values[i] - mean) * (values[i] - mean);
        }

        var mid = Math.floor(count/2);
        var median = (count % 2) ? values[mid] : (values[mid-1] + values[mid])/2;

        var stddev = Math.sqrt(sumOfDiffs / count);
        current_timer_data["std"] = stddev;
        current_timer_data["upper"] = max;
        current_timer_data["lower"] = min;
        current_timer_data["count"] = timer_counters[key];
        current_timer_data["count_ps"] = timer_counters[key] / (flushInterval / 1000);
        current_timer_data["sum"] = sum;
        current_timer_data["mean"] = mean;
        current_timer_data["median"] = median;

        // note: values bigger than the upper limit of the last bin are ignored, by design
        conf = histogram || [];
        bins = [];
        for (var i = 0; i < conf.length; i++) {
            if (key.indexOf(conf[i].metric) > -1) {
                bins = conf[i].bins;
                break;
            }
        }
        if(bins.length) {
            current_timer_data['histogram'] = {};
        }
        // the outer loop iterates bins, the inner loop iterates timer values;
        // within each run of the inner loop we should only consider the timer value range that's within the scope of the current bin
        // so we leverage the fact that the values are already sorted to end up with only full 1 iteration of the entire values range
        var i = 0;
        for (var bin_i = 0; bin_i < bins.length; bin_i++) {
          var freq = 0;
          for (; i < count && (bins[bin_i] == 'inf' || values[i] < bins[bin_i]); i++) {
            freq += 1;
          }
          bin_name = 'bin_' + bins[bin_i];
          current_timer_data['histogram'][bin_name] = freq;
        }

        timer_data[key] = current_timer_data;

      }
    }

    statsd_metrics["processing_time"] = (Date.now() - starttime);
    //add processed metrics to the metrics_hash
    metrics.counter_rates = counter_rates;
    metrics.timer_data = timer_data;
    metrics.statsd_metrics = statsd_metrics;

    flushCallback(metrics);
  }

exports.process_metrics = process_metrics
