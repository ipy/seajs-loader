用于加载原 seajs 模块的 webpack loader.

### 做的事情
* 解析 seajs 模块别名
* 直接翻译 require.async/seajs.use 成 require
* 去掉 define 参数中的 id 和依赖，只保留 factory 方法

### 已知限制
* 没有处理 seajs 相关插件
* seajs 别名的解析只能处理字面常量，不能处理变量
* require.async/seajs.use 方法的参数只能处理字面常量的模块，不能处理变量

### 设置
* `seajsConfigPath` seajs-config 的路径
* `excludeAlias` 不解析的 seajs 别名