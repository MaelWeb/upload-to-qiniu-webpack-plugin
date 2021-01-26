'use strict';
// use Polyfill for util.promisify in node versions < v8
const promisify = require('util.promisify');

const qiniu = require("qiniu");
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const _array = require('lodash/array');
const _difference = require('lodash/difference');
const _extend = require('lodash/extend');
const hidefile = require('hidefile')

const fsStatPromise = promisify(fs.stat);
const fsReadDirPromise = promisify(fs.readdir);

const successUnloadLog = '.success_upload_log.json';
const failedUploadLog = '.faile_upload_log.json';

class UploadToQiniuWebpackPlugin {
    constructor(options) {
        this.options = _extend({
            qiniuAccessKey: 'qiniuAccessKey',
            qiniuSecretKey: 'qiniuSecretKey',
            qiniuBucket: 'qiniuBucket',
            qiniuZone: 'Zone_z0',
            uploadTaget: null, // targe to upload
            excludeHtml: true,
            publicPath: '',
            enabledRefresh: false,
            onlyRefreshHtml: false,
            uploadLogPath: null,
            prefixPath: '',
        }, options);

        this.config = new qiniu.conf.Config();
        this.config.zone = qiniu.zone[this.options.qiniuZone];
        qiniu.conf.RPC_TIMEOUT = 600000;

        this.mac = new qiniu.auth.digest.Mac(this.options.qiniuAccessKey, this.options.qiniuSecretKey);

        // global value
        this.allUploadIsSuccess = true;
        this.allRefreshIsSuccess = true;
        this.failedObj = {
            uploadFiles: {},
            refreshArr: []
        };
        this.needUploadArray = [];
        this.successUploadFilesData = {};
        this.successUploadLogData = {};

        this.uploadCount = 0;
        this.fileCount = 0;

        this.callback = null;
    }

    apply(compiler) {
        const _this = this;

        if (!_this.options.uploadTaget) {
            _this.options.uploadTaget = compiler.options.output.path;
        }

        if (!_this.options.publicPath) {
            _this.options.publicPath = compiler.options.output.publicPath;
        }

        if (!_this.options.uploadLogPath) {
            _this.options.uploadLogPath = compiler.options.context;
        }

        try {
            let statInstance = fs.statSync(path.resolve(_this.options.uploadLogPath, successUnloadLog));
            if (statInstance.isFile()) {
                this.successUploadFilesData = JSON.parse(fs.readFileSync(path.resolve(_this.options.uploadLogPath, successUnloadLog), 'utf8'));
            }
        } catch (err) {}
        (compiler.hooks ? compiler.hooks.afterEmit.tapAsync.bind(compiler.hooks.afterEmit, 'UploadToQiniuWebpackPlugin') : compiler.plugin.bind(compiler, 'afterEmit'))((compilation, callback) => {
            _this.callback = callback.bind(this);

            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Starting upload files to Qiniu clound ');

            _this.readFilesFormDir(_this.options.uploadTaget).then((paths) => {
                _this.fileCount = paths.length;

                console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Comparing ${_this.fileCount} files...`);
                paths.forEach(item => {
                    let key = path.relative(_this.options.uploadTaget, item);
                    if (_this.successUploadFilesData[key]) {
                        delete _this.successUploadFilesData[key]
                    }
                    _this.successUploadLogData[key] = new moment().format('YYYY-MM-DD HH:mm:ss');
                    _this.needUploadArray.push(item)

                    if (_this.needUploadArray.length == _this.fileCount) {
                        console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Uploading ${_this.needUploadArray.length} files...`)
                        _this.uploadFilesByArr(_this.needUploadArray)
                    }
                })

            });
        })
    }

    getToken(bucket, key) {
        let options = {
            scope: bucket + ":" + key
        };

        let putPolicy = new qiniu.rs.PutPolicy(options);

        return putPolicy.uploadToken(this.mac);
    }

    uploadFile(uptoken, key, localFile) {
        let formUploader = new qiniu.form_up.FormUploader(this.config),
            putExtra = new qiniu.form_up.PutExtra();

        formUploader.putFile(uptoken, key, localFile, putExtra, (err, respBody, respInfo) => {
            if (err) {
                this.allUploadIsSuccess = false;
                this.failedObj.uploadFiles[key] = new moment().format('YYYY-MM-DD HH:mm:ss');

                console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', ` ${key}  Upload Failed!!`)

            }
            this.uploadCount++;

            if (this.uploadCount === this.needUploadArray.length) {
                this.dealFileInClound();
            }
        });
    }

    dealFileInClound() {
        let _this = this;
        this.allUploadIsSuccess && console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'All File Is Upload Successful \r\n');

        let bucketManager = new qiniu.rs.BucketManager(this.mac, this.config),
            successDtaKeys = Object.keys(this.successUploadFilesData),
            successDtaKeysLength = successDtaKeys.length,
            allFileIsSuccess = true,
            deleteOperations = [];

        if (successDtaKeysLength !== 0) {

            successDtaKeys.forEach((key) => {
                deleteOperations.push(qiniu.rs.deleteOp(this.options.qiniuBucket, key))
            })
            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Deleting ${successDtaKeys.length} Files on CDN \r\n`);

            bucketManager.batch(deleteOperations, function (err, respBody, respInfo) {
                if (err) {
                    console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Deleting Files Error: ', err);
                } else {
                    // 200 is success, 298 is part success
                    if (parseInt(respInfo.statusCode / 100) == 2) {
                        respBody.forEach(function (item) {
                            if (item.code !== 200) {
                                allFileIsSuccess = false
                                console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', item, '\r\n');
                            }
                        });
                        if (allFileIsSuccess) {
                            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'All Extra File Is Deleted Form QiniuCloud Successful\r\n')
                        } else {
                            console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Some Deleted is Failed\r\n')
                        }
                    } else {
                        // console.log(respInfo.deleteusCode);
                        // console.log(respBody);
                    }
                }
                if(_this.options.enabledRefresh){
                    _this.refreshInClound(_this.needUploadArray || []);
                } else {
                    _this.writeLog()
                    _this.callback()
                }
            });
        } else {
            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'There Is Not Have Extra File Need To Delete\r\n');
            if (this.options.enabledRefresh) {
                this.refreshInClound(this.needUploadArray || []);
            } else {
                this.writeLog()
                this.callback()
            }
        }

    }

    writeLog() {
        if (!this.allUploadIsSuccess || !this.allRefreshIsSuccess) {
            for (let key in this.failedObj.uploadFiles) {
                delete this.successUploadLogData[key]
            }
            fs.writeFile(path.resolve(this.options.uploadLogPath, failedUploadLog), JSON.stringify(this.failedObj), 'utf8', (err) => {
                if (err) {
                    console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Error:', err, '\r\n')
                }

            });
        }
        fs.writeFile(path.resolve(this.options.uploadLogPath, successUnloadLog), JSON.stringify(this.successUploadLogData), 'utf8', (err) => {
            if (err) {
                console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Unload File Log  Write Failed\r\n')
            }
        });

    }

    refreshInClound(needRefreshArr = []) {
        let cdnManager = new qiniu.cdn.CdnManager(this.mac);
        if(this.options.onlyRefreshHtml){
            needRefreshArr = needRefreshArr.filter(item => path.extname(item) === '.html')
        }
        const _this = this
        //  Can refresh 100 one time
        let refreshQueue = _array.chunk(needRefreshArr, 100);
        
        console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Refreshing ${needRefreshArr.length} files...`);
        refreshQueue.forEach((item, index) => {
            item = item.map((it) => {
                return this.options.publicPath + it.replace(this.options.uploadTaget + '/', '')
            });
            cdnManager.refreshUrls(item, function (err, respBody, respInfo) {
                if (err) {
                    _this.allRefreshIsSuccess = false
                    _this.failedObj.refreshArr = _this.failedObj.refreshArr.concat(item.map(it=>it.replace(_this.options.uploadTaget + '/', '')))
                    console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Refresh Files Failed\r\n')

                    if(_this.options.onlyRefreshHtml){
                        // throw new Error(err)
                        process.exit(1) // 操作系统发送退出码（强制终止），返回零时才会继续，任何非零退出代码Jenkins将判定为部署失败。
                    }
                }
                if (respInfo.statusCode == 200) {
                    // let jsonBody = JSON.parse(respBody);
                    // console.log(jsonBody);
                    console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Refresh Files Successful\r\n') 
                }
                if (index === refreshQueue.length - 1) {
                    _this.writeLog()
                    _this.callback()
                }
            });
        })
    }

    uploadFilesByArr(arr) {
        arr.forEach((path) => {

            let filePath = path,
                key = path.replace(this.options.uploadTaget + '/', this.options.prefixPath),
                token = this.getToken(this.options.qiniuBucket, key);

            this.uploadFile(token, key, filePath);
        })
    }

    readFilesFormDir(dir) {
        return fsStatPromise(dir).then((stats) => {
            let ret;
            if (hidefile.isHiddenSync(dir)) return []

            if (stats.isDirectory()) {
                ret = fsReadDirPromise(dir).then((files) => {
                    return Promise.all(files.map(file => this.readFilesFormDir(dir + '/' + file)))
                }).then((paths) => {
                    return [].concat(...paths)
                })
                ret = ret || []
            } else if (stats.isFile()) {
                if (!this.options.excludeHtml) {
                    ret = dir
                } else {
                    !/\.html$/.test(dir) ? (ret = dir) : (ret = [])
                }
            } else {
                ret = []
            }
            return ret
        })
    }
}


module.exports = UploadToQiniuWebpackPlugin;