var path = require('path');
var UploadToQiniuWebpackPlugin = require('../index.js');

module.exports = {
    context: __dirname,
    entry: './example.js',
    mode: "development",
    output: {
        path: path.join(__dirname, 'dist/'),
        publicPath: '',
        filename: 'bundle.js'
    },
    module: {
    },
    plugins: [
        new UploadToQiniuWebpackPlugin({
			qiniuAccessKey: 'ARA9LIvdx3JFZyADmwohmEMyjVLmNSIjVxgpzIA4',
            qiniuSecretKey: 'aK19LEtOfStwsvn501Pl_h_wTqkVFnbzxlI5FNU7',
            qiniuBucket: 'hynal-static-test',
            qiniuZone: 'Zone_z0',
        })
    ]
};