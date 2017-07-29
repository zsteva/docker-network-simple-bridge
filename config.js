
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var cfg_dir = null;

function init(cfg_dir_) {
    cfg_dir = cfg_dir_;
}

function store_cfg(id, data) {
    try {
        var filepath = path.join(cfg_dir, id + '.json');
        fs.writeFileSync(filepath, JSON.stringify(data), { encoding: 'utf8' });
        return true;
    } catch (e) {
        console.log("store_cfg error: ", e);
    }
    return false;
}

function load_cfg(id, fail_ok) {
    try {
        var filepath = path.join(cfg_dir, id + '.json');
        var buf = fs.readFileSync(filepath, { encoding: 'utf8' });
        var data = JSON.parse(buf);
        return data;
    } catch (e) {
        if (!fail_ok) {
            console.log("load_cfg error: ", e);
        }
    }
    return null;
}

function remove_cfg(id) {
    var filepath = path.join(cfg_dir, id + '.json');
    fs.unlinkSync(filepath);
}

module.exports = {
    init: init,

    store: store_cfg,

    load: load_cfg,

    remove: remove_cfg,
};

