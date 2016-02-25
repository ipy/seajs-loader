var fs = require('fs');
var path = require('path');
var qs = require('querystring');
var uglify = require('uglify-js');

function getSeajsConfig(seajsConfigPath, contextPath, excludeAlias) {
  if(!seajsConfigPath) { return {}; }
  var seajsConfigFile = fs.readFileSync(path.join(contextPath, seajsConfigPath), 'utf-8');
  var seajsConfig = {};
  var seajsConfigWalker = new uglify.TreeWalker(function(node) {
    if(node instanceof uglify.AST_ObjectKeyVal
      && seajsConfigWalker.find_parent(uglify.AST_Call).expression.print_to_string() === 'seajs.config') {
        switch(node.key) {
          case 'alias':
            seajsConfig.alias = seajsConfig.alias || {};
            if(node.value && node.value.properties) {
              node.value.properties.forEach(function(prop) {
                if(!excludeAlias || excludeAlias.indexOf(prop.key) === -1) {
                  seajsConfig.alias[prop.key] = prop.value.value;
                }
              });
            }
            break;
        }
      }
  });
  uglify.parse(seajsConfigFile).walk(seajsConfigWalker);
  return seajsConfig;
}

function resolve(name, seajsConfig) {
  if(seajsConfig.alias && seajsConfig.alias[name]) {
    name = seajsConfig.alias[name]; 
  }
  // var arr = name.split('!');
  // if(arr.length > 1) {
  //   for (var i = 0; i < arr.length - 1, i++) {
  //     if(arr[i] === 'text') { arr[i] = 'raw'; }
  //   }
  // }
  if(name && name[0] === '/') {
    name = name.slice(1);
  }
  return name;
}

function translate(code, map, seajsConfig) {
  var ast = uglify.parse(code);
  ast = ast.transform(new uglify.TreeTransformer(function(node, descend) {
    node = node.clone();
    if(node instanceof uglify.AST_Call) {
      var expression = node.expression.print_to_string();
      switch(expression) {
        case 'define':
          if(node.args.length > 1) {
            node.args = node.args.slice(node.args.length - 1);
          }
          break;
        case 'require':
          if(node.args.length == 1 && node.args[0] instanceof uglify.AST_String) {
            node.args[0].value = resolve(node.args[0].value, seajsConfig);
          }
          break;
        case 'require.async':
        case 'seajs.use':
          var args = node.args;
          if(args.length < 1 || args.length > 2) {
            throw new Error('require.async 参数过多或过少, ' + expression + ' :' + node.start.line);
          }
          var modules;
          if(args[0] instanceof uglify.AST_Array) {
            modules = args[0].elements.map(function(el) {
              if (el instanceof uglify.AST_String) {
                return el.value;
              }
              else {
                throw new Error('require.async 引用模块名不为 string 类型, ' + el.print_to_string() + ' :' + node.start.line);
              }
            });
          } else if (args[0] instanceof uglify.AST_String) {
            modules = [args[0].value];
          } else {
            throw new Error('require.async 引用模块名不为 string 类型, ' + args[0].print_to_string() + ' :' + node.start.line);
          }
          modules = modules.map(function(name) { return resolve(name, seajsConfig); });
          args[0] = uglify.parse(JSON.stringify(modules)).body[0].body;

          node.expression = uglify.parse('require').body[0].body;
          break;
      }
    }
    descend(node, this);
    return node;
  }));
  var sourceMap;
  if(map) {
    sourceMap = uglify.SourceMap({
      orig: map,
    });
  }
  var stream = uglify.OutputStream({
    beautify: true,
    comments: true,
    source_map: sourceMap,
  });
  ast.print(stream);
  return {
    source: stream.toString(),
    map: sourceMap ? sourceMap.toString() : undefined,
  };
}

var seajsConfigs = {};

module.exports = function(source, map) {
  this.cacheable && this.cacheable();
  try {
    var query = this.query ? qs.parse(this.query.slice(1)) : {};
    var seajsConfig = seajsConfigs[this.query] || (query.seajsConfigPath
      ? getSeajsConfig(query.seajsConfigPath, this.options.context, query.excludeAlias)
      : {});
    seajsConfigs[this.query] = seajsConfig;
      
    var result = translate(source, map, seajsConfig);
    this.callback(null, result.source/*, result.map*/); // TODO: source-map 引起一个错误
  } catch(e) {
    console.error(this.resourcePath, e.message)
    this.callback(e);
  }
}
