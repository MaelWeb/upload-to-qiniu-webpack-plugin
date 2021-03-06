<div align="center">
  <a href="https://github.com/webpack/webpack">
    <img width="200" height="200"
      src="https://webpack.js.org/assets/icon-square-big.svg">
  </a>
  <h1>Upload To Qiniu Webpack Plugin</h1>
  <p>A plugin upload file to qiniu clound for webpack</p>
</div>

<h2 align="center">Install</h2>

```bash
  npm i --save-dev upload-to-qiniu-webpack-plugin
```

<!-- ```bash
  yarn add --dev upload-to-qiniu-webpack-plugin
``` -->


<h2 align="center">Usage</h2>
This plugin will upload the target file/folder to Qiniu Clound. Just add the plugin to your `webpack`
config as follows:

**webpack.config.js**
```js
const UploadToQiniuWebpackPlugin = require('upload-to-qiniu-webpack-plugin');

module.exports = {
  entry: 'index.js',
  output: {
    path: __dirname + '/dist',
    filename: 'index_bundle.js'
  },
  plugins: [
    new UploadToQiniuWebpackPlugin({
        qiniuAccessKey: 'ARA9LIvdx3JFZyADmwohmNSIjVxgpzIA4',
        qiniuSecretKey: 'aK19LEtOfStwsvn5TqkVFnbzxlI5FNU7',
        qiniuBucket: 'bucket-test',
        qiniuZone: 'Zone_z0',
    })
  ]
}
```

<h2 align="center">Options</h2>

You can pass a hash of configuration options to `upload-to-qiniu-webpack-plugin`.
Allowed values are as follows

|Name|Type|Default|Description|
|:--:|:--:|:-----:|:----------|
|**[`qiniuAccessKey`](#)**|`{String}`|`null`| Your Qiniu AccessKey |
|**[`qiniuSecretKey`](#)**|`{String}`|`null`| Your Qiniu SecretKey |
|**[`qiniuBucket`](#)**|`{String}`|`null`| Your Qiniu Bucket Name |
|**[`qiniuZone`](#)**|`{String}`|`null`| Your Qiniu zone code |
|**[`enabledRefresh`](#)**|`{Boolean}`|`false`| Is enable refresh the file on Qiniu Clound after file upload|
|**[`excludeHtml`](#)**|`{Boolean}`|`true`| Is exclude html file |
|**[`onlyRefreshHtml`](#)**|`{Boolean}`|`false`| only refresh html file (eg: */demo/index.html + */demo/), throws an exception in the case of a failure. |
|**[`prefixPath`](#)**|`{String}`| - | prefix path for the file |
|**[`uploadLogPath`](#)**|`{String}`|[webpackConfig.context](https://webpack.js.org/configuration/entry-context/#context)|  Provide a directory where log file should be stored |
|**[`uploadTaget`](#)**|`{String}`|[webpackConfig.output.path](https://webpack.js.org/configuration/output/#output-path)|The target file/folder to upload|

About [Zone](https://developer.qiniu.com/kodo/sdk/1289/nodejs):

|Name|value|
|:--:|:----------|
|**[`华东`](#)**| "Zone_z0" |
|**[`华北`](#)**| "Zone_z1" |
|**[`华南`](#)**| "Zone_z2" |
|**[`北美`](#)**| "Zone_na0" |