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
            exclude: 'html', // Todo
            publicPath: '',
            enabledRefresh: false,
            uploadLogPath: null,
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

    }

    apply(compiler) {
        const _this = this;

        if (!_this.options.uploadTaget) {
            _this.options.uploadTaget = compiler.options.output.path;
        }

        if (!_this.options.publicPath) {
            _this.options.publicPath = compiler.options.output.publicPath;
        }

        if (!_this.options.uploadLogPath ) {
            _this.options.uploadLogPath = compiler.options.context;
        }

        try {
            let statInstance = fs.statSync(path.resolve(_this.options.uploadLogPath, successUnloadLog));
            if (statInstance.isFile()) {
                this.successUploadFilesData = JSON.parse(fs.readFileSync(successUnloadLog, 'utf8'));
                console.log(this.successUploadFilesData);
            }
        } catch (err) {}

        (compiler.hooks ? compiler.hooks.done.tapAsync.bind(compiler.hooks.done, 'UploadToQiniuWebpackPlugin') : compiler.plugin.bind(compiler, 'done'))((stats, callback) => {
            callback();

            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]','Starting upload files to Qiniu clound ');

            _this.readFilesFormDir(_this.options.uploadTaget).then((paths) => {
                _this.fileCount = paths.length;

                console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Comparing ${_this.fileCount} files...`);

                paths.forEach((path) => {
                    let key = path.match(new RegExp('^' + _this.options.uploadTaget + '[/](.*)$'))[1];
                    if (_this.successUploadFilesData[key]) {
                        delete _this.successUploadFilesData[key]
                    }
                    _this.successUploadLogData[key] = new moment().format('YYYY-MM-DD HH:mm:ss');
                    _this.needUploadArray.push(path)

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
        this.allUploadIsSuccess && console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'All File Is Upload Successful');

        let bucketManager = new qiniu.rs.BucketManager(this.mac, this.config),
            successDtaKeys = Object.keys(this.successUploadFilesData),
            successDtaKeysLength = successDtaKeys.length,
            allFileIsSuccess = true,
            deleteOperations = [];

        if (successDtaKeysLength !== 0) {

            successDtaKeys.forEach((key) => {
                deleteOperations.push(qiniu.rs.deleteOp(this.options.qiniuBucket, key))
            })
            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', `Deleting ${successDtaKeys.length} Files on CDN`);

            bucketManager.batch(deleteOperations, function(err, respBody, respInfo) {
                if (err) {
                    console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Deleting Files Error: ', err);
                } else {
                    // 200 is success, 298 is part success
                    if (parseInt(respInfo.statusCode / 100) == 2) {
                        respBody.forEach(function(item) {
                            if (item.code !== 200) {
                                allFileIsSuccess = false
                                console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', item);
                            }
                        });
                        if (allFileIsSuccess) {
                            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'All Extra File Is Deleted Form QiniuCloud Successful')
                        } else {
                            console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Some Deleted is Failed')
                        }
                    } else {
                        // console.log(respInfo.deleteusCode);
                        // console.log(respBody);
                    }
                }
                _this.writeLog()
                _this.options.enabledRefresh && _this.refreshCDN(needUpload);
            });
        } else {
            console.log('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'There Is Not Have Extra File Need To Delete');
            this.writeLog()
        }

    }

    writeLog() {
        if (!this.allUploadIsSuccess || !this.allRefreshIsSuccess) {
            for (let key in this.failedObj.uploadFiles) {
                delete this.successUploadLogData[key]
            }
            fs.writeFile(path.resolve(this.options.uploadLogPath, failedUploadLog), JSON.stringify(this.failedObj), 'utf8', (err) => {
                if (err) {
                    console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Error:', err)
                }

            });
        }
        fs.writeFile(path.resolve(this.options.uploadLogPath, successUnloadLog), JSON.stringify(this.successUploadLogData), 'utf8', (err) => {
            if (err) {
                console.error('\x1b[2m%s\x1b[0m : ', '[UploadToQiniuWebpackPlugin]', 'Unload File Log  Write Failed')
            }
        });

    }

    refreshInClound(needRefreshArr) {
        let cdnManager = new qiniu.cdn.CdnManager(this.mac);
        //  Can refresh 100 one time
        needRefreshArr = _array.chunk(needRefreshArr, 100);
        needRefreshArr.forEach((item, index) => {
            item = item.map((it) => {
                return this.options.publicPath + it.replace(this.options.path + '/', '')
            });

            cdnManager.refreshUrls(item, function(err, respBody, respInfo) {
                if (err) {
                    this.allRefreshIsSuccess = false
                    this.failedObj.refreshArr = this.failedObj.refreshArr.concat(item.map(it => it.replace(this.options.publicPath, '')))
                }
                if (respInfo.statusCode == 200) {
                    // let jsonBody = JSON.parse(respBody);
                    // console.log(jsonBody);
                }
                if (index === needRefreshArr.length - 1) {
                    this.writeLog()
                }
            });
        })
    }

    uploadFilesByArr(arr) {
        arr.forEach((path) => {

            let filePath = path,
                key = path.replace(this.options.uploadTaget + '/', ''),
                token = this.getToken(this.options.qiniuBucket, key);

            this.uploadFile(token, key, filePath);
        })
    }

    readFilesFormDir(dir) {
        return fsStatPromise(dir).then((stats) => {
            let ret;
            if (stats.isDirectory()) {
                ret = fsReadDirPromise(dir).then((files) => {
                    return Promise.all(files.map(file => this.readFilesFormDir(dir + '/' + file)))
                }).then((paths) => {
                    return [].concat(...paths)
                })
                ret = ret || []
            } else if (stats.isFile() && !/\.html$/.test(dir)) {
                ret = dir
            } else {
                ret = []
            }
            return ret
        })
    }
}


module.exports = UploadToQiniuWebpackPlugin;