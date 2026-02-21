# 将原来的 (params, _opts) 改为 (opts)
s/return async (params, _opts)/return async (opts/g
s/return async (_params, _opts)/return async (opts/g

# 更改参数访问方式
s/params\.timeRange/opts.params.timeRange/g
s/params\.metricType/opts.params.metricType/g
s/params\.from/opts.params.from/g
s/params\.to/opts.params.to/g

# 修正respond调用
s/respond(/opts.respond(/g
